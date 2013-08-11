// dependencies
//	knockout
//	sugarjs
//	zepto

"use strict";

ko.bindingHandlers.title = {
	init: function(element, valueAccessor) {
		element.title = valueAccessor();
	},
	update: function(element, valueAccessor) {
		element.title = valueAccessor();
	}
};

var mechanize; // global
var dbg;

(function() {
	var TimeTracker = function(totalms, updatems, complete, repeat) {
		var self = this;

		updatems = updatems || 1000;
		var elapsedms = ko.observable(0);
		var intervalId = null;

		self.elapsedms = ko.computed(function(){
			return elapsedms();
		});
		self.totalms = totalms;

		self.progress = ko.computed(function() {
			return elapsedms() / totalms;
		});

		self.progress.marginRight = ko.computed(function() {
			return (100 - 100 * self.progress()) + '%';
		});

		var completed = ko.observable(false);
		self.isComplete = ko.computed(function() {
			return completed();
		});

		self.stop = function() {
			if (intervalId) clearInterval(intervalId);
			intervalId = null;
		};

		self.start = function() {
			self.stop();
			elapsedms(0);
			completed(false);

			intervalId = setInterval(function() {
				elapsedms(elapsedms() + updatems);

				if(elapsedms() >= totalms) {
					self.stop();
					elapsedms(totalms);
					completed(true);

					var cancelToken = {cancel: false};
					if(complete) complete(cancelToken);
					if(repeat && !cancelToken.cancel) self.start();
				}
			}, updatems);
		};

		self.toJSON = function() {
			return Object.reject(ko.toJS(self), 'progress');
		};

		self.start();
	};

	function makeArray(length, element) {
		var elementfn = element;
		if (typeof(element) != "function") elementfn = function() {return element;};
		return Array.apply(null, Array(length)).map(elementfn);
	}

	var ResourceModel = function(type) {
		var self = this;
		self.type = type;
	};

	var InventoryItemModel = function(resource) {
		var self = this;
		self.resource = ko.observable(resource);
		self.active = ko.observable(false);

		self.toJSON = function() {
			return Object.reject(ko.toJS(self), 'active');
		};
	};

	var InventoryModel = function(size) {
		var self = this;

		self.activeItem = ko.observable();
		self.items = ko.observableArray(makeArray(size, function() {
			return new InventoryItemModel(null);
		}));

		self.deactivate = function() {
			if (!self.activeItem()) return;
			self.activeItem().active(false);
			self.activeItem(null);
		};

		self.collect = function(resource) {
			var emptySlot = self.items().find(function(item) { return !item.resource() });
			if (!emptySlot) return false;
			emptySlot.resource(resource);
			return true;
		};

		self.accept = self.collect; // todo deprecate one

		self.select = function(item) {
			if (!item.resource()) return;
			var alreadyActive = item.active();
			self.deactivate();

			if (!alreadyActive) {
				self.activeItem(item);
				item.active(true);
			} else {
				item.active(false);
			}
		};

		self.popActive = function() {
			var active = self.activeItem();
			if (!active) return null;
			self.activeItem(null);
			active.active(false);
			var resource = active.resource();
			active.resource(null);
			return resource;
		}
	};

	var WastesModel = function(inventory) {
		var self = this;

		self.junk = ko.observableArray(makeArray(80, function() { return { resource: ko.observable() }; }));
		self.regenerateJunk = function() {
			self.junk().forEach(function(j) {
				var rnd = Math.random(), type = null;
				if (rnd < 0.01) type = "iron";
				else if (rnd < 0.05) type = "rock";

				j.resource(type && new ResourceModel(type));
			});
		};
		self.regenerateJunk();

		var regenerator = new TimeTracker(30000, 200, self.regenerateJunk, true);
		self.regenerator = function() { 
			return regenerator; 
		};
			
		self.collect = function(wasteCell) {
			if (!wasteCell.resource()) return;
			var success = inventory.collect(wasteCell.resource());
			if (success) wasteCell.resource(null);
			return success;
		};
	};

	// todo scrap?
	var PlayerModel = function(name) {
		var self = this;

		self.name = name;
	};

	var TrashEjectorModel = function(inventory) {
		var self = this;
		self.tracker = ko.observable();
		self.contents = ko.observable();

		self.accept = function(inventoryItem) {
			var resource = inventory.popActive();
			self.contents(resource);

			self.tracker(new TimeTracker(20000, 200, function() {
				self.contents(null);
				self.tracker(null);
			}));
		};
	};

	var RockCollectorModel = function(inventory) {
		var self = this;
		
		self.tracker = new TimeTracker(10000, 200, function(cancelToken) {
			var success = inventory.collect(new ResourceModel("rock"));
			if (!success) cancelToken.cancel = true;
		}, true);

		self.start = self.tracker.start;
		self.stop = self.tracker.stop;
	};

	var DeviceCollectionModel = function() {
		var self = this;
		var prefix = "mechanize_";
		var devices = [];

		self.getDevices = function() {
			return Object.keys(devices).map(function (key) {
				return devices[key];
			});
		};

		var invalidationToken = ko.observable(0);
		self.all = ko.computed(function() {
			invalidationToken();
			return self.getDevices();
		});
		self.invalidateObservable = function() {
			invalidationToken.notifySubscribers(null);
		};

		self.getDevice = function(name) {
			return devices[prefix + name];
		};

		self.createDevice = function(name, type, args) {
			var constructDevice = function(name, type, args) {
				switch (type) {
					case "TrashEjector": 	return new TrashEjectorModel(self.getDevice(args.inventory));
					case "RockCollector":	return new RockCollectorModel(self.getDevice(args.inventory));
					case "Inventory":		return new InventoryModel(args.size);
				}
			};
			var device = constructDevice(name, type, args);
			device.name = name;
			device.type = type;

			device.visible = ko.observable(false);
			device.toggleVisibility = function() { device.visible(!device.visible()); };

			devices[prefix + name] = device;
			self.invalidateObservable();
			return device;
		};

		self.removeDevice = function(name) {
			delete devices[prefix + name];
			self.invalidateObservable();
		};
	}

	var MechanizeViewModel = function() {
		var self = this;

		self.player = new PlayerModel("Bob");
		self.devices = new DeviceCollectionModel;

		var inventory = self.devices.createDevice("inventory", "Inventory", {size: 16});
		self.devices.createDevice("Trash Ejector", "TrashEjector", {inventory: "inventory"});
		self.devices.createDevice("collector", "RockCollector", {inventory: "inventory"});

		self.wastes = new WastesModel(inventory);
	};

	window.addEventListener("load", function() {
		mechanize = ko.observable(new MechanizeViewModel);
		ko.applyBindings(mechanize);

		var saveFilter = function(key, value) {
			if (value == null) return undefined;
			return value;
		};

		var saveModel = function() {
			var serialized = ko.toJSON(mechanize, saveFilter);
			window.localStorage.setItem("mechanize", serialized);
		};

		dbg = function() {
			console.log(ko.toJSON(mechanize, saveFilter, 2));
		};

		var loadModel = function() {
			var serialized = window.localStorage.getItem("mechanize");
			if (!serialized) return;

			var load = function(model, saved, path) {
				for (var key in saved) {
					if (!saved.hasOwnProperty(key)) continue;
					var newPath = (path || "$") + "." + key;
					var savedVal = saved[key];
					
					if (["number", "string"].find(typeof(savedVal))) {
						if (ko.isObservable(model[key])) {
							model[key](savedVal);
						}
					} else if (newPath == "$.player.inventory.items") {
						model[key].removeAll();

						savedVal.forEach(function(item) {
							var resource = item.resource && new ResourceModel(item.resource.type);
							var newItem = new InventoryItemModel(resource);
							newItem.active(item.active);
							model[key].push(newItem);
						});
					} else if (newPath == "$.devices") {
						model[key].removeAll();

						// todo get args from ?? somewhere
						//var args
						//savedVal
						

					} else {
						load(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
					}
				}
			}

			var model = new MechanizeViewModel;
			var saved = JSON.parse(serialized);
			load(model, saved);

			mechanize(model);
		};

		$("body").on("click", "#saveButton", saveModel);
		$("body").on("click", "#loadButton", loadModel);

		$("#loadingMessage").hide();
		$("#gameSurface").css("visibility", "");
	});
})();
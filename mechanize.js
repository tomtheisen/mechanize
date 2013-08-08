ko.bindingHandlers.title = {
	init: function(element, valueAccessor) {
		element.title = valueAccessor();
	},
	update: function(element, valueAccessor) {
		element.title = valueAccessor();
	}
};


(function() {
	var TimeTracker = function(totalms, updatems, complete, repeat) {
		var self = this;

		updatems = updatems || 1000;
		var elapsedms = ko.observable(0);
		var intervalId = null;

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

	var InventoryItemViewModel = function(resource) {
		var self = this;
		self.resource = ko.observable(resource);
		self.active = ko.observable(false);
	};

	var InventoryViewModel = function(size) {
		var self = this;

		self.activeItem = ko.observable();
		self.items = ko.observableArray(makeArray(size, function() {
			return new InventoryItemViewModel(null);
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

	var PlayerModel = function() {
		var self = this;
		self.inventory = new InventoryViewModel(16);
	};

	var TrashEjectorModel = function(name, inventory) {
		var self = this;
		self.tracker = ko.observable();

		self.name = name;
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

	var MechanizeViewModel = function() {
		var self = this;

		self.player = new PlayerModel;
		self.wastes = new WastesModel(self.player.inventory);

		self.consumers = ko.observableArray([
			new TrashEjectorModel("Trash Ejector", self.player.inventory)
		]);

		self.producers = ko.observableArray([
			new RockCollectorModel(self.player.inventory)
		]);
	};

	window.addEventListener("load", function() {
		mechanize = ko.observable(new MechanizeViewModel);
		ko.applyBindings(mechanize);

		var saveFilter = function(key, value) {
			//if (["wastes", "active"].find(key)) return undefined;
			if (value === null) return undefined;
			return value;
		};

		var saveModel = function() {
			var serialized = ko.toJSON(mechanize, saveFilter);
			window.localStorage.setItem("mechanize", serialized);
		};

		var loadModel = function() {
			var serialized = window.localStorage.getItem("mechanize");
			if (!serialized) return;

			var load = function(model, saved) {
				for (key in saved) {
					if (!saved.hasOwnProperty(key)) continue;
					var val = saved[key];
					
					if (typeof(val) == "number" || typeof(val) == "string") {
						if (ko.isObservable(model[key])) {
							model[key](val);
						}
					} else if (val instanceof Array) {
						if (ko.isObservable(model[key]) && (model[key]() instanceof Array)) {

						}
					} else {
						if (ko.isObservable(model[key])) {
							load(model[key](), val);
						} else {
							load(model[key], val);
						}
					}
				}
			}

			var model = new MechanizeViewModel;
			//var saved = JSON.parse(serialized);
			//load(model, saved);
			ko.mapping.fromJSON(serialized, model);

			mechanize(model);
			//alert("not actually loaded");
		};

		$("body").on("click", "#saveButton", saveModel);
		$("body").on("click", "#loadButton", loadModel);

		$("#loadingMessage").hide();
		$("#gameSurface").css("visibility", "");
	});
})();

function dbg() {
	function stripNulls(key, val) {
		return val === null ? undefined : val;
	}

	console.log(ko.toJSON(mechanize, stripNulls, 2));
}
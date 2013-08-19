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

var mechanize; // globals
var dbg;

(function() {
	var killed = false;		// set when fatal error occurs and all execution should stop
	var kill = function(message) {
		message = message || "Something bad happened. :(";
		
		//Notifications.show(message ); // not going to see it anyway

		$("#gameSurface").hide();
		$("#systemError > .message").text(message);
		$("#systemError").show();

		killed = true;
	}

	var Notifications = (function() {
		var notifications = ko.observableArray([]);

		var show = function(message) {
			notifications.push(message);
			if(ko.utils.unwrapObservable(notifications).length > 20) notifications.shift();

			var $notification = $("<div />").addClass("notification").text(message)
				.appendTo("#notifications");

			var args = {"max-height": "0px", "max-width": "0px", opacity: 0};
			window.setTimeout(function() {
				$notification.animate(args, 4000, "ease", function() {
					$notification.remove();
				});
			}, 10000);
		};

		return {show: show, log: notifications, toJSON: function() {}};
	})();

	function makeArray(length, element) {
		var elementfn = element;
		if (typeof(element) != "function") elementfn = function() {return element;};
		return Array.apply(null, Array(length)).map(elementfn);
	}

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
				if (killed) return;
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

	var InventoryModel = function(size, outputs) {
		var self = this;
		self.outputs = ko.observableArray(outputs || []);

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
		};

		self.sendActiveTo = function(receiverName) {
			var success = self.send(receiverName, self.activeItem().resource());
			if (success) self.popActive();
		};
	};

	var WastesModel = function(inventoryName) {
		var self = this;

		self.junk = ko.observableArray(makeArray(80, function() { return { resource: ko.observable() }; }));
		self.junk().toJSON = function() { };
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
			//var success = inventory.accept(wasteCell.resource());
			var success = self.send(inventoryName, wasteCell.resource());
			if (success) wasteCell.resource(null);
			return success;
		};
	};

	// todo scrap?
	var PlayerModel = function(name) {
		var self = this;

		self.name = name;
		self.notifications = Notifications; // has to be part of viewmodel so knockout events can be bound
	};

	var TrashEjectorModel = function() {
		var self = this;
		self.tracker = ko.observable();
		self.contents = ko.observable();

		self.accept = function(inventoryItem) {
			if (self.tracker()) return false;
			
			self.contents(inventoryItem);

			self.tracker(new TimeTracker(20000, 200, function() {
				self.contents(null);
				self.tracker(null);
			}));

			return true;
		};
	};

	var RockCollectorModel = function(receiverName) {
		var self = this;
		
		self.tracker = new TimeTracker(10000, 200, function(cancelToken) {
			var success = self.send(receiverName, new ResourceModel("rock"));
			if (!success) cancelToken.cancel = true;
		}, true);

		self.start = self.tracker.start;
		self.stop = self.tracker.stop;
	};

	var DeviceCollectionModel = function() {
		var self = this;
		var prefix = "mechanize_";
		var devices = {};

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

		self.attached = ko.computed(function() {
			return self.all().filter(function(d) {
				return !!["expanded", "collapsed"].find(d.uistate());
			})
		});

		self.detached = ko.computed(function() {
			return self.all().filter(function(d) {
				return d.uistate() == "detached"
			})
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
					case "TrashEjector": 	return new TrashEjectorModel;
					case "RockCollector":	return new RockCollectorModel(args.output);
					case "Inventory":		return new InventoryModel(args.size, args.outputs);
					case "Wastes":			return new WastesModel(args.output);
				}
			};
			var device = constructDevice(name, type, args);
			device.name = name;
			device.type = type;

			device.uistate = ko.observable("expanded");
			device.collapse = function() { device.uistate("collapsed"); };
			device.expand = function() { device.uistate("expanded"); };
			device.detach = function() { device.uistate("detached"); };
			device.toggleCollapse = function() {
				device.uistate(device.uistate() == "collapsed" ? "expanded" : "collapsed");
			}

			device.send = function(receiverName, item) {
				var receiver = self.getDevice(receiverName);
				if (!receiver) return false;
				
				var success = receiver.accept && receiver.accept(item);
				var $receiver = $("[data-device='" + receiverName +"']");
				var $sender = $("[data-device='" + name + "']");
				if (success) {
					$receiver.addClass("bumped");

					window.setTimeout(function() {$receiver.removeClass("bumped")}, 1000);
				} else {
					$sender.addClass("error");
					Notifications.show("Failed to send item from " + name + " to " + receiverName + ".");

					window.setTimeout(function() {$receiver.removeClass("error")}, 2000);
				}

				return success;
			};

			devices[prefix + name] = device;
			self.invalidateObservable();
			return device;
		};

		self.removeDevice = function(name) {
			delete devices[prefix + name];
			self.invalidateObservable();
		};

		self.removeAll = function() {
			devices.length = 0;
			self.invalidateObservable();
		};
	}

	var MechanizeViewModel = function() {
		var self = this;

		self.player = new PlayerModel("Bob");
		self.devices = new DeviceCollectionModel;

		self.initializeGame = function() {
			self.devices.createDevice("Cargo Hold", "Inventory", {size: 16, outputs: ["Airlock"]});
			self.devices.createDevice("Airlock", "TrashEjector");
			self.devices.createDevice("Rock Collector Bot", "RockCollector", {output: "Cargo Hold"});
			self.devices.createDevice("Resource Mining", "Wastes", {output: "Cargo Hold"}).detach();
		};
	};

	window.addEventListener("load", function() {
		var saveFilter = function(key, value) {
			if (value == null) return undefined;
			return value;
		};

		var saveModel = function() {
			try {
				var serialized = ko.toJSON(mechanize, saveFilter);
				window.localStorage.setItem("mechanize", serialized);
				Notifications.show("Saved successfully.");
			} catch (e) {
				Notifications.show("Error occurred during save.");
			}
		};

		var confirmReset = function() {
			var $controlsContents = $("#gameControls > *").remove();

			var $yes = $("<button />").text("yes");
			var $no = $("<button />").text("no");

			$("#gameControls").text("Reset?").append($yes).append($no);
			
			$no.click(function() {
				$("#gameControls").empty().append($controlsContents);
			});

			$yes.click(function() {
				window.localStorage.removeItem('mechanize');
				window.location.reload();
			});
		}

		dbg = function() {
			console.log(ko.toJSON(mechanize, saveFilter, 2));
		};

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
				} else if (newPath == "$.wastes.junk") {
					// todo

				} else if (newPath == "$.devices") {
					model[key].removeAll();

					// todo get args from ?? somewhere
					//var args
					//savedVal
					

				} else {
					load(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
				}
			}
		};

		mechanize = ko.observable(new MechanizeViewModel);
		var serialized = window.localStorage.getItem('mechanize');
		if(serialized) {
			try {
				var model = new MechanizeViewModel;
				var saved = JSON.parse(serialized);
				load(model, saved);

				mechanize(model);
				ko.applyBindings(mechanize);

				Notifications.show("Loaded successfully");
			} catch (e) {
				console.log(e.message);
				// debugger;
			 	kill("Error occurred during load");
			}
		} else {
			try {
				mechanize().initializeGame();
				ko.applyBindings(mechanize);

				Notifications.show("Initialized mechanize.  Welcome.")
			} catch (e) {
				console.log(e.message);
				// debugger;
				kill("Failed to set up game");
			}
		}

		$("body").on("click", "#saveButton", saveModel);
		$("body").on("click", "#resetButton", confirmReset);
		$("#notificationsButton").click(function() {
			$("#notificationsLog").toggle();
		});
		$("#notifications").on("click", ".notification", function() {
			$(this).remove();
		});

		$("#loadingMessage").hide();
		$("#gameSurface").css("visibility", "");
	});
})();
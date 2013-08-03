(function() {
	var TimeTracker = function(totalms, updatems, complete, repeat) {
		var self = this;

		updatems = updatems || 1000;
		var elapsedms = 0;
		var intervalId = null;

		self.progress = ko.observable(0);
		self.isComplete = ko.observable(false);

		self.stop = function() {
			if (intervalId) clearInterval(intervalId);
			intervalId = null;
		};

		self.start = function() {
			self.stop();
			elapsedms = 0;

			intervalId = setInterval(function() {
				elapsedms += updatems;
				self.progress(elapsedms / totalms);
				if(elapsedms >= totalms) {
					self.stop();
					self.progress(1);
					self.isComplete(true);

					if(complete) complete();
					if(repeat) self.start();
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

	var SpaceJunkViewModel = function(type) {
		var self = this;

		if (!type) {
			var rnd = Math.random();
			if (rnd < 0.01) type = "iron";
			else if (rnd < 0.05) type = "rock";
			else type = "none";
		}
		self.type = type;

		self.isPresent = ko.computed(function() {
			return self.type != "none";
		});
	};

	var noneResource = new SpaceJunkViewModel("none");

	var InventoryItemViewModel = function(resource) {
		var self = this;
		self.resource = resource;
		self.active = ko.observable(false);

		self.activate = function() {
			if(self.resource.type == "none") return;
			self.active(!self.active());
		}
	};

	var MechanizeViewModel = function() {
		var self = this;

		self.player = {
			inventory: ko.observableArray(makeArray(16, function() {
				return new InventoryItemViewModel(noneResource);
			})),
			canCollect: function(resource) {
				return resource.type != "none" 
					&& self.player.inventory().any(function(item) { return item.resource.type == "none" });
			},
			collect: function(resource) {
				var index = self.player.inventory().findIndex(function(item) { return item.resource.type == "none" });
				self.player.inventory.splice(index, 1, new InventoryItemViewModel(resource));
				self.player.inventory.deactivateAll();
			}			
		};
		self.player.inventory.deactivateAll = function() {
			self.player.inventory().forEach(function(item) { item.active(false); });
		};
		
		var junk = ko.observableArray();
		var regenerateJunk = function() {
			junk.splice.apply(junk, [0, 80].concat(makeArray(80, function() { return new SpaceJunkViewModel; })));
		};
		regenerateJunk();
		self.wastes = {
			junk: junk, 
			regenerator:  new TimeTracker(30000, 200, regenerateJunk, true),
			regenerateJunk: regenerateJunk
		};

		self.collect = function(resource) {
			if (!self.player.canCollect(resource)) return;

			self.player.collect(resource);
			self.wastes.junk.replace(resource, noneResource);
		};
	};

	function setup() {
		ko.bindingHandlers.title = {
			init: function(element, valueAccessor) {
				element.title = valueAccessor();
			},
			update: function(element, valueAccessor) {
				element.title = valueAccessor();
			}
		};

		mechanize = new MechanizeViewModel;
		ko.applyBindings(mechanize);
	};

	window.addEventListener("load", setup);
})();

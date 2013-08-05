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

			intervalId = setInterval(function() {
				elapsedms(elapsedms() + updatems);

				if(elapsedms() >= totalms) {
					self.stop();
					elapsedms(totalms);
					completed(true);

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
			self.deactivate();
			self.activeItem(item);
			item.active(true);
		};
	};

	var WastesModel = function(inventory) {
		var self = this;

		self.junk = ko.observableArray(makeArray(80, function() { return { resource: ko.observable() }; }));
		self.regenerateJunk = function() {
			self.junk().forEach(function(j) {
				var rnd = Math.random(), type = null;
				if (rnd < 0.01) type = "iron";
				else if (rnd < 0.05) type = "rock";

				j.resource(type && new SpaceJunkViewModel(type));
			});
		};
		self.regenerateJunk();

		self.regenerator = new TimeTracker(30000, 200, self.regenerateJunk, true);
			
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

	var MechanizeViewModel = function() {
		var self = this;

		self.player = new PlayerModel;
		self.wastes = new WastesModel(self.player.inventory);
	};

	function setup() {
		mechanize = new MechanizeViewModel;
		ko.applyBindings(mechanize);
	};

	window.addEventListener("load", setup);
})();

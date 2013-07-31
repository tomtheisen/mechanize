(function() {
	var SpaceJunkViewModel = function(type) {
		var self = this;

		self.type = type || (Math.random() < 0.1 ? "rock" : "none");

		self.isPresent = ko.computed(function() {
			return self.type != "none";
		});
	};

	var MechanizeViewModel = function() {
		var self = this;

		self.player = {
			inventory: ko.observableArray([
				new SpaceJunkViewModel("rock"), 
				new SpaceJunkViewModel("metal")
			]),
			canCollect: function(resource) {
				return resource.type != "none";
			}
		};
		self.wastes = ko.observableArray();
		for (var i = 0; i < 100; i++) {
			self.wastes.push(new SpaceJunkViewModel);
		};

		self.collect = function(resource) {
			if (!self.player.canCollect(resource)) return;

			self.player.inventory.push(resource);
			var index = self.wastes.indexOf(resource);
			self.wastes.splice(index, 1, new SpaceJunkViewModel("none"));
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

		ko.applyBindings(new MechanizeViewModel);
	};

	window.addEventListener("load", setup);
})();

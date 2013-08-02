(function() {
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

	var MechanizeViewModel = function() {
		var self = this;

		self.player = {
			inventory: ko.observableArray(
				Array.apply(null, new Array(16)).map(function() {return noneResource;})
			),
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

			var inventoryIndex = self.player.inventory.indexOf(noneResource);
			if (inventoryIndex >= 0) {
				self.player.inventory.splice(inventoryIndex, 1, resource);

				var wastesIndex = self.wastes.indexOf(resource);
				self.wastes.splice(wastesIndex, 1, noneResource);
			}
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

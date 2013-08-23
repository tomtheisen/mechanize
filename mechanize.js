/* jshint curly: false, eqnull: true, indent: 4, devel: true, noempty: false */

// dependencies
//  knockout
//  sugarjs
//  zepto
//  seedrandom

(function (ko, $) {
    "use strict";

    var mechanize = ko.observable();
    window.mechanize = mechanize;

    ko.bindingHandlers.title = {
        init: function (element, valueAccessor) {
            element.title = valueAccessor();
        },
        update: function (element, valueAccessor) {
            element.title = valueAccessor();
        }
    };

    var killed = false;     // set when fatal error occurs and all execution should stop
    var kill = function (message) {
        message = message || "Something bad happened. :(";

        $("#gameSurface").hide();
        $("#systemMessage").text(message)
            .append('<br><a href="javascript:location.reload();">Reload</a>')
            .append('<br><a href="javascript:window.localStorage.removeItem(\'mechanize\');location.reload();">Reset data</a>')
            .show();

        killed = true;
    };

    var Notifications = (function () {
        var notifications = ko.observableArray([]);

        var show = function (message) {
            notifications.push(message);
            if (ko.utils.unwrapObservable(notifications).length > 20) {
                notifications.shift();
            }

            var $notification = $("<div />").addClass("notification").text(message)
                .appendTo("#notifications");

            var args = {"max-height": "0px", "max-width": "0px", opacity: 0};
            window.setTimeout(function () {
                $notification.animate(args, 4000, "ease", function () {
                    $notification.remove();
                });
            }, 10000);
        };

        var shown = ko.observable(false);

        return {
            show: show,
            log: notifications,
            shown: shown,
            toggle: function () {shown(!shown()); },
            toJSON: function () { }
        };
    })();

    function makeArray(length, element) {
        var elementfn = element;
        if (typeof element !== "function") {
            elementfn = function () {return element; };
        }

        return Array.apply(null, new Array(length)).map(elementfn);
    }

    var TimeTracker = function (totalms, updatems, complete, repeat) {
        var self = this;

        updatems = updatems || 1000;
        var elapsedms = ko.observable(0);
        var intervalId = null;

        self.elapsedms = ko.computed(function () {
            return elapsedms();
        });
        self.totalms = totalms;

        self.progress = ko.computed(function () {
            return elapsedms() / totalms;
        });

        self.progress.marginRight = ko.computed(function () {
            return (100 - 100 * self.progress()) + '%';
        });

        var completed = ko.observable(false);
        self.isComplete = ko.computed(function () {
            return completed();
        });

        self.stop = function () {
            if (intervalId) clearInterval(intervalId);
            intervalId = null;
        };

        self.start = function () {
            self.stop();
            elapsedms(0);
            completed(false);

            intervalId = setInterval(function () {
                if (killed) return;

                elapsedms(elapsedms() + updatems);

                if (elapsedms() >= totalms) {
                    self.stop();
                    elapsedms(totalms);
                    completed(true);

                    var cancelToken = {cancel: false};
                    if (complete) complete(cancelToken);
                    if (repeat && !cancelToken.cancel) self.start();
                }
            }, updatems);
        };

        self.toJSON = function () {
            return Object.reject(ko.toJS(self), 'progress'); // sugar
        };

        self.start();
    };

    var ResourceModel = function (type) {
        var self = this;
        self.type = type;
    };

    var InventoryItemModel = function (resource) {
        var self = this;
        self.resource = ko.observable(resource);
        self.active = ko.observable(false);

        self.toJSON = function () {
            return Object.reject(ko.toJS(self), 'active'); // sugar
        };
    };

    var InventoryModel = function (size, outputs) {
        var self = this;
        self.outputs = ko.observableArray(outputs || []);

        self.activeItem = ko.observable();
        self.items = ko.observableArray(makeArray(size, function () {
            return new InventoryItemModel(null);
        }));

        self.deactivate = function () {
            if (!self.activeItem()) return;

            self.activeItem().active(false);
            self.activeItem(null);
        };

        self.accept = function (resource) {
            var emptySlot = self.items().find(function (item) {  // sugar
                return !item.resource(); 
            });
            if (!emptySlot) return false;

            emptySlot.resource(resource);
            return true;
        };

        self.select = function (item) {
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

        self.popActive = function () {
            var active = self.activeItem();
            if (!active) return null;

            self.activeItem(null);
            active.active(false);
            var resource = active.resource();
            active.resource(null);
            return resource;
        };

        self.sendActiveTo = function (receiverName) {
            var success = self.send(receiverName, self.activeItem().resource());
            if (success) self.popActive();
        };
    };

    var WastesModel = function (inventoryName) {
        var self = this;

        self.junk = ko.observableArray(makeArray(80, function () { return { resource: ko.observable() }; }));
        self.junk().toJSON = function () { };

        self.lastSeed = null;
        self.regenerateJunk = function () {
            self.lastSeed = Math.random();
            Math.seedrandom(self.lastSeed);

            self.junk().forEach(function (j) {
                var rnd = Math.random(), type = null;
                if (rnd < 0.01) {
                    type = "iron";
                } else if (rnd < 0.05) {
                    type = "rock";
                }

                j.resource(type && new ResourceModel(type));
            });
        };
        self.regenerateJunk();

        var regenerator = new TimeTracker(30000, 200, self.regenerateJunk, true);
        self.regenerator = function () {return regenerator; };

        self.collect = function (wasteCell) {
            if (!wasteCell.resource()) return;

            //var success = inventory.accept(wasteCell.resource());
            var success = self.send(inventoryName, wasteCell.resource());
            if (success) wasteCell.resource(null);
            return success;
        };
    };

    var PlayerModel = function (name) {
        var self = this;

        self.name = name;
        self.notifications = Notifications; // has to be part of viewmodel so knockout events can be bound
    };

    var TrashEjectorModel = function () {
        var self = this;
        self.tracker = ko.observable();
        self.contents = ko.observable();

        self.accept = function (inventoryItem) {
            if (self.tracker()) return false;

            self.contents(inventoryItem);

            self.tracker(new TimeTracker(20000, 200, function () {
                self.contents(null);
                self.tracker(null);
            }));

            return true;
        };
    };

    var RockCollectorModel = function (receiverName) {
        var self = this;

        self.tracker = new TimeTracker(10000, 200, function (cancelToken) {
            var success = self.send(receiverName, new ResourceModel("rock"));
            if (!success) cancelToken.cancel = true;
        }, true);

        self.start = self.tracker.start;
        self.stop = self.tracker.stop;
    };

    var DeviceCollectionModel = function () {
        var self = this;
        var prefix = "mechanize_";
        var devices = Object.extended({});  // sugar

        self.getDevices = function () {return devices.values(); };  // sugar

        var invalidationToken = ko.observable(0);
        self.all = ko.computed(function () {
            invalidationToken();
            return self.getDevices();
        });

        self.attached = ko.computed(function () {
            return self.all().filter(function (d) {
                return ["expanded", "collapsed"].any(d.uistate()); // sugar
            });
        });

        self.detached = ko.computed(function () {
            return self.all().filter(function (d) {
                return d.uistate() === "detached";
            });
        });

        self.invalidateObservable = function () {
            invalidationToken.notifySubscribers(null);
        };

        self.getDevice = function (name) {
            return devices[prefix + name];
        };

        self.createDevice = function (name, type, args) {
            var constructDevice = function (type, args) {
                switch (type) {
                case "TrashEjector": return new TrashEjectorModel();
                case "RockCollector": return new RockCollectorModel(args.output);
                case "Inventory": return new InventoryModel(args.size, args.outputs);
                case "Wastes": return new WastesModel(args.output);
                }
            };
            var device = Object.merge(constructDevice(type, args), { // sugar
                name: name,
                type: type,
                uistate: ko.observable("expanded"),
                collapse: function () { device.uistate("collapsed"); },
                expand: function () { device.uistate("expanded"); },
                detach: function () { device.uistate("detached"); },
                toggleCollapse: function () {
                    var state = {"collapsed": "expanded", "expanded": "collapsed"}[device.uistate()];
                    if (state) device.uistate(state);
                },
                send: function (receiverName, item) {
                    var receiver = self.getDevice(receiverName);
                    if (!receiver) return false;

                    var success = receiver.accept && receiver.accept(item);
                    var $receiver = $("[data-device='" + receiverName + "']");
                    var $sender = $("[data-device='" + name + "']");
                    if (success) {
                        $receiver.addClass("bumped");

                        window.setTimeout(function () {
                            $receiver.removeClass("bumped");
                        }, 1000);
                    } else {
                        $sender.addClass("error");
                        Notifications.show("Failed to send item from " + name + " to " + receiverName + ".");

                        // window.setTimeout(function () {$sender.removeClass("error")}, 2000);
                    }

                    return success;
                }
            });

            devices[prefix + name] = device;
            self.invalidateObservable();
            return device;
        };

        self.removeDevice = function (name) {
            delete devices[prefix + name];
            self.invalidateObservable();
        };

        self.removeAll = function () {
            devices = {};
            self.invalidateObservable();
        };
    };

    var MechanizeViewModel = function () {
        var self = this;

        self.player = new PlayerModel("Bob");
        self.devices = new DeviceCollectionModel();

        self.initializeGame = function () {
            self.devices.createDevice("Cargo Hold", "Inventory", {size: 16, outputs: ["Airlock"]});
            self.devices.createDevice("Airlock", "TrashEjector");
            self.devices.createDevice("Rock Collector Bot", "RockCollector", {output: "Cargo Hold"});
            self.devices.createDevice("Resource Mining", "Wastes", {output: "Cargo Hold"}).detach();
        };
    };

    window.addEventListener("load", function () {
        var saveFilter = function (key, value) {
            if (value == null) return undefined;
            return value;
        };

        var saveModel = function () {
            try {
                var serialized = ko.toJSON(mechanize, saveFilter);
                window.localStorage.setItem("mechanize", serialized);
                Notifications.show("Saved successfully.");
            } catch (e) {
                Notifications.show("Error occurred during save.");
            }
        };

        var confirmReset = function () {
            var $controlsContents = $("#gameControls > *").remove();

            var $yes = $("<button />").text("yes");
            var $no = $("<button />").text("no");

            $("#gameControls").text("Reset?").append($yes).append($no);

            $no.click(function () {
                $("#gameControls").empty().append($controlsContents);
            });

            $yes.click(function () {
                window.localStorage.removeItem('mechanize');
                window.location.reload();
            });
        };

        window.dbg = function () {
            console.log(ko.toJSON(mechanize, saveFilter, 2));
        };

        var load = function (model, saved, path) {
            var addIntentoryItem = function (inventoryItems, item) {
                var resource = item.resource && new ResourceModel(item.resource.type);
                var newItem = new InventoryItemModel(resource);
                newItem.active(item.active);
                inventoryItems.push(newItem);
            };

            for (var key in saved) {
                if (saved.hasOwnProperty(key)) {
                    var newPath = (path || "$") + "." + key;
                    var savedVal = saved[key];

                    if (["number", "string"].any(typeof savedVal)) { // sugar
                        if (ko.isObservable(model[key])) model[key](savedVal);

                    } else if (newPath === "$.player.inventory.items") {
                        model[key].removeAll();
                        savedVal.forEach(addIntentoryItem.bind(null, model[key]));

                    } else if (newPath === "$.wastes.junk") {
                        // todo

                    } else if (newPath === "$.devices") {
                        model[key].removeAll();

                        // todo get args from ?? somewhere
                        //var args
                        //savedVal


                    } else {
                        load(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
                    }
                }
            }
        };

        mechanize(new MechanizeViewModel());
        var serialized = window.localStorage.getItem('mechanize');
        if (serialized) {
            try {
                var model = new MechanizeViewModel();
                var saved = JSON.parse(serialized);
                load(model, saved);

                mechanize(model);
                ko.applyBindings(mechanize);

                Notifications.show("Loaded successfully.");
            } catch (e) {
                console.log(e.message);
                // debugger;
                kill("Error occurred during load.");
                return;
            }
        } else {
            try {
                mechanize().initializeGame();
                ko.applyBindings(mechanize);

                Notifications.show("Initialized mechanize.  Welcome.");
            } catch (e) {
                console.log(e.message);
                // debugger;
                kill("Failed to set up game.");
                return;
            }
        }

        $("body").on("click", "#saveButton", saveModel);
        $("body").on("click", "#resetButton", confirmReset);
        $("#notificationsButton").click(function () {
            $("#notificationsLog").toggle();
        });
        $("#notifications").on("click", ".notification", function () {
            $(this).remove();
        });

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
})(window.ko, window.$);

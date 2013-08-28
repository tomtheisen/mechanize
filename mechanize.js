/* jshint curly: false, eqnull: true, indent: 4, devel: true, noempty: false */

// dependencies
//  knockout
//  sugarjs
//  zepto

(function (ko, $) {
    "use strict";

    var mechanize;

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

    window.dbg = function () {
        console.log(ko.toJSON(mechanize, saveFilter, 2));
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

        return {
            show: show,
            log: notifications,
            shown: ko.observable(false),
            toJSON: function () { }
        };
    })();

    function makeArray(length, element) {
        var isFunction = Object.isFunction(element); // sugar

        var result = [];
        for (var i=0; i < length; i++) {
            result.push(isFunction ? element() : element);
        }

        return result;
    }

    var TimeTracker = function (totalms, updatems, complete, repeat, autostart) {
        var self = this;

        if (autostart === undefined) autostart = true;

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

        if (autostart) self.start();
    };

    var ResourceModel = function (type) {
        var self = this;
        self.type = type;
    };

    var InventorySlotModel = function (resource) {
        var self = this;
        self.resource = ko.observable(resource);
        self.active = ko.observable(false);

        self.toJSON = function () {
            return Object.reject(ko.toJS(self), 'active'); // sugar
        };
    };

    var InventoryModel = function (args) {
        var self = this;

        self.params = Object.clone(args);
        self.outputs = ko.observableArray(args.outputs || []);
        self.params.outputs = self.outputs;

        self.activeItem = ko.observable();
        self.items = ko.observableArray(makeArray(self.params.size, function () {
            return new InventorySlotModel(null);
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

        self.setDeviceInfo = function (deviceInfo) {
            self.items().zip(deviceInfo.items).forEach(function (tuple) {
                var slot = tuple[0];
                var newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        };
    };

    var WastesModel = function (args) {
        var self = this;

        self.params = Object.clone(args);

        self.junk = ko.observableArray(makeArray(80, function () { return { resource: ko.observable() }; }));
        self.junk().toJSON = function () { };

        self.regenerateJunk = function () {
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

        var regenerator = new TimeTracker(30000, 100, self.regenerateJunk, true);
        self.regenerator = function () {return regenerator; };

        self.collect = function (wasteCell) {
            if (!wasteCell.resource()) return;

            var success = self.send(self.params.output, wasteCell.resource());
            if (success) wasteCell.resource(null);
            return success;
        };
    };

    var PlayerModel = function (name) {
        var self = this;

        self.name = name;
    };

    var TrashEjectorModel = function (args) {
        args = args; // to supress unused arg jshint error for now

        var self = this;
        self.tracker = ko.observable();
        self.contents = ko.observable();

        self.accept = function (resource) {
            if (self.tracker()) return false;

            self.contents(resource);

            self.tracker(new TimeTracker(20000, 100, function () {
                self.contents(null);
                self.tracker(null);
            }));

            return true;
        };

        self.setDeviceInfo = function (deviceInfo) {
            if (deviceInfo.contents) {
                self.accept(new ResourceModel(deviceInfo.contents.type));
            }
        };
    };

    var RockCollectorModel = function (args) {
        var self = this;

        self.params = Object.clone(args);

        self.tracker = new TimeTracker(10000, 100, function (cancelToken) {
            var success = self.send(self.params.output, new ResourceModel("rock"));
            if (!success) cancelToken.cancel = true;
        }, true, self.params.running);

        self.start = function() {
            self.params.running = true;
            self.tracker.start();
        };

        self.stop = function() {
            self.params.running = false;
            self.tracker.stop();
        };
    };

    var DeviceConstructorModel = function (args) {
        var self = this;

        self.params = Object.clone(args);

        self.items = ko.observableArray(makeArray(self.params.size, function () {
            return new InventorySlotModel(null);
        }));

        self.accept = function (resource) {
            var emptySlot = self.items().find(function (item) {  // sugar
                return !item.resource(); 
            });
            if (!emptySlot) return false;

            emptySlot.resource(resource);
            return true;
        };

        self.fabricate = function () {
            Notifications.show("Fabricating.");
            self.items().forEach(function (slot) {
                slot.resource(null);
            });
        };
    };

    var DeviceCollectionModel = function () {
        var self = this;
        var prefix = "mechanize_";
        var devices = {};

        self.getDevices = function () {
            return Object.values(devices); // sugar
        };

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
                case "TrashEjector": 
                    return new TrashEjectorModel(args);
                case "RockCollector": 
                    return new RockCollectorModel(args);
                case "Inventory": 
                    return new InventoryModel(args);
                case "Wastes": 
                    return new WastesModel(args);
                case "DeviceConstructor":
                    return new DeviceConstructorModel(args);    
                default:
                    throw new RangeError("Cannot create a device of type " + type);
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

        self.toJSON = function() {
            return ko.toJS(self.all());
        };
    };

    var OptionsModel = function() {
        var self = this;

        self.autosave = ko.observable(false);
        var autosaveIntervalId;
        self.autosave.subscribe(function (autosave) {
            Notifications.show("Autosave is " + (autosave ? "on" : "off") + ".");

            if (autosaveIntervalId) clearInterval(autosaveIntervalId);
            if (autosave) autosaveIntervalId = window.setInterval(saveModel, 120000);
        });

        self.visualEffects = ko.observable(false);
        self.visualEffects.subscribe(function (vfx) {
            Notifications.show("Visual effects are " + (vfx ? "on" : "off") + ".");

            if (vfx) {
                $("body").addClass("vfx");
            } else {
                $("body").removeClass("vfx");
            }
        });
    };

    var created = false;
    var MechanizeViewModel = function () {
        if (created) kill("Must not call MechanizeViewModel more than once.");
        created = true;
        var self = this;

        self.player = new PlayerModel("Bob");
        self.devices = new DeviceCollectionModel();
        self.options = new OptionsModel();
        self.modelVersion = ko.observable("0.1.0");
        self.notifications = Notifications; // has to be part of viewmodel so knockout events can be bound

        self.initializeGame = function () {
            self.devices.createDevice("Cargo Hold", "Inventory", {size: 16, outputs: ["Airlock", "Fabrication Lab"]});
            self.devices.createDevice("Airlock", "TrashEjector");
            self.devices.createDevice("Fabrication Lab", "DeviceConstructor", {size: 8});
            self.devices.createDevice("Resource Mining", "Wastes", {output: "Cargo Hold"}).detach();
            //self.devices.createDevice("Rock Collector Bot", "RockCollector", {output: "Cargo Hold"});
        };
    };

    window.addEventListener("load", function () {
        var load = function (model, saved, path) {
            var addDevice = function (deviceCollection, deviceInfo) {
                var device = deviceCollection.createDevice(
                    deviceInfo.name, deviceInfo.type, deviceInfo.params);

                if (deviceInfo.uistate) device.uistate(deviceInfo.uistate);
                if (device.setDeviceInfo) device.setDeviceInfo(deviceInfo);
            };

            for (var key in saved) {
                if (saved.hasOwnProperty(key)) {
                    var newPath = (path || "$") + "." + key;
                    var savedVal = saved[key];

                    if (["number", "string", "boolean"].any(typeof savedVal)) { // sugar
                        if (ko.isObservable(model[key])) model[key](savedVal);

                    } else if (newPath === "$.devices") {
                        model[key].removeAll();
                        savedVal.forEach(addDevice.bind(null, model[key]));

                    } else {
                        load(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
                    }
                }
            }
        };
        
        var serialized = window.localStorage.getItem('mechanize');
        if (serialized) {
            try {
                mechanize = new MechanizeViewModel();
                var saved = JSON.parse(serialized);
                load(mechanize, saved);

                ko.applyBindings(mechanize);

                Notifications.show("Loaded successfully.");
            } catch (e) {
                console.log(e.message);
                kill("Error occurred during load.");
                return;
            }
        } else {
            try {
                mechanize = new MechanizeViewModel();
                mechanize.initializeGame();
                ko.applyBindings(mechanize);

                Notifications.show("Initialized mechanize.  Welcome.");
            } catch (e) {
                console.log(e.message);
                kill("Failed to set up game.");
                return;
            }
        }
        window.mechanize = mechanize;

        $("body").on("click", "#saveButton", saveModel);

        $("body").on("click", "#resetButton", function () {
            var $controls = $("#gameControls > *").hide();

            var $yes = $("<button />").addClass("warning").text("yes");
            var $no = $("<button />").text("no");

            var $confirmation = $("<div />").text("Reset and lose all data?").append($yes).append($no);
            $("#gameControls").append($confirmation);

            $no.click(function () {
                $confirmation.remove();
                $controls.show();
            });

            $yes.click(function () {
                window.localStorage.removeItem('mechanize');
                window.location.reload();
            });
        });

        $("#notificationsButton").click(function () {
            $("#notificationsLog").toggle();
        });

        $("#notifications").on("click", ".notification", function () {
            $(this).remove();
        });

        $("header .max-toggle").click(function () {
            $(this).toggleClass("active").parent().toggleClass("maxed");
        });

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
})(window.ko, window.$);

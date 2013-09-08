/// <reference path="sugar.d.ts" />
/// <reference path="knockout.d.ts" />
/// <reference path="zepto.d.ts" />

/* jshint curly: false, eqnull: true, indent: 4, devel: true, noempty: false */

// dependencies
//  knockout
//  sugarjs
//  zepto
//  DragDrop

ko.bindingHandlers["title"] = {
    init:   (element, valueAccessor) => { element.title = valueAccessor(); },
    update: (element, valueAccessor) => { element.title = valueAccessor(); },
};

declare var DragDrop;

module Mechanize {
    interface CancelToken {
        cancel: boolean;
    }

    class ResourceModel {
        type: string;

        constructor(type: string) {
            this.type = type;
        }
    }

    class OptionsModel {
        autosave: KnockoutObservable<boolean>;
        visualEffects: KnockoutObservable<boolean>;

        constructor() {
            this.autosave = ko.observable(false);

            var autosaveIntervalId : number;
            this.autosave.subscribe(function (autosave: boolean) {
                Notifications.show("Autosave is " + (autosave ? "on" : "off") + ".");

                if (autosaveIntervalId) clearInterval(autosaveIntervalId);
                if (autosave) autosaveIntervalId = window.setInterval(saveModel, 120000);
            });

            this.visualEffects = ko.observable(false);
            this.visualEffects.subscribe(function (vfx) {
                Notifications.show("Visual effects are " + (vfx ? "on" : "off") + ".");

                if (vfx) {
                    $("body").addClass("vfx");
                } else {
                    $("body").removeClass("vfx");
                }
            });
        }
    }

    var mechanize;

    function makeHandler(fn: () => void) {
        return (e: Event) => { fn(); return true; };
    }

    var killed = false;     // set when fatal error occurs and all execution should stop
    var kill = function (message: string) {
        message = message || "Something bad happened. :(";

        $("#gameSurface").hide();
        $("#systemMessage").text(message)
            .append('<br><a href="javascript:location.reload();">Reload</a>')
            .append('<br><a href="javascript:window.localStorage.removeItem(\'mechanize\');location.reload();">Reset data</a>')
            .show();

        killed = true;
    };

    var saveModel = function (e: Event) {
        try {
            var serialized = ko.toJSON(mechanize, (key: string, value) => value == null ? undefined : value);
            window.localStorage.setItem("mechanize", serialized);
            Notifications.show("Saved successfully.");
            return true;
        } catch (e) {
            Notifications.show("Error occurred during save.");
            return false;
        }
    };

    var Notifications = (function () {
        var notifications = ko.observableArray([]);

        var show = function (message: string) {
            notifications.push(message);
            if (ko.utils.unwrapObservable(notifications).length > 20) {
                notifications.shift();
            }

            var $notification = $("<div />").addClass("notification").text(message)
                .appendTo("#notifications");

            var args = { "max-height": "0px", "max-width": "0px", opacity: 0 };
            window.setTimeout(function () {
                $notification.animate(args, 4000, "ease", () => { $notification.remove(); });
            }, 10000);
        };

        return {
            show: show,
            log: notifications,
            shown: ko.observable(false),
            toJSON: () => undefined,
        };
    })();

    function makeArray(length: number, element): Array {
        var isFunction = typeof (element) === "function";

        var result = [];
        for (var i = 0; i < length; i++) {
            result.push(isFunction ? element() : element);
        }

        return result;
    }

    function getFormattedTimespan(totalSeconds: number): string {
        var seconds = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var minutes = totalMinutes % 60;
        var totalHours = Math.floor(totalMinutes / 60);

        var formatted = "";

        if (totalHours) formatted += totalHours + ":";
        if (formatted || minutes) formatted += (formatted && minutes < 10 && "0") + minutes + ":";
        formatted += (formatted && seconds < 10 && "0") + seconds;

        return formatted;
    }

    var TimeTracker = function (totalms: number, updatems: number, complete: (cancel: CancelToken) => void, repeat?: boolean, autostart?: boolean) {
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

        self.progress.remainingFormatted = ko.computed(function () {
            var seconds = (totalms - elapsedms()) / 1000;
            return getFormattedTimespan(Math.round(seconds));
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

                    var cancelToken: CancelToken = { cancel: false };
                    if (complete) complete(cancelToken);
                    if (repeat && !cancelToken.cancel) self.start();
                }
            }, updatems);
        };

        self.toJSON = function () {
            return (<any> Object).reject(ko.toJS(self), 'progress'); // sugar
        };

        if (autostart) self.start();
    };

    var InventorySlotModel = function (resource) {
        var self = this;
        self.resource = ko.observable(resource);
        self.active = ko.observable(false);

        self.toJSON = () => (<any> Object).reject(ko.toJS(self), 'active'); // sugar
    };

    var InventoryModel = function (args) {
        var self = this;

        self.params = (<any> Object).clone(args);
        self.outputs = ko.observableArray(args.outputs || []);
        self.params.outputs = self.outputs;

        self.activeItem = ko.observable();
        self.items = ko.observableArray(makeArray(self.params.size, () => new InventorySlotModel(null)));

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
                var slot = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        };
    };

    var WastesModel = function (args) {
        var self = this;

        self.params = (<any> Object).clone(args);

        self.junk = ko.observableArray(
            makeArray(self.params.size, function () { return { resource: ko.observable() }; }));

        self.regenerateJunk = function () {
            var rnd = Math.random(), type;
            if (rnd < 0.05) {
                type = "iron";
            } else {
                type = "rock";
            }

            var idx = Math.floor(Math.random() * self.junk().length);
            self.junk()[idx].resource(new ResourceModel(type));
        };
        if (self.params.randomize) {
            for (var i = 0; i < self.junk().length / 2; i++) {
                self.regenerateJunk();
            }
            self.regenerateJunk();
            self.params.randomize = false;
        }

        var regenerator = new TimeTracker(15000, null, self.regenerateJunk, true);
        self.regenerator = function () { return regenerator; };

        self.collect = function (wasteCell) {
            if (!wasteCell.resource()) return;

            var success = self.send(self.params.output, wasteCell.resource());
            if (success) wasteCell.resource(null);
            return success;
        };

        self.shutDown = function () {
            self.regenerator.stop();
        };

        self.setDeviceInfo = function (deviceInfo) {
            console.log("todo: WastesModel setDeviceInfo");
            void (deviceInfo);
        };
    };

    var PlayerModel = function (name) {
        var self = this;

        self.name = name;
    };

    var TrashEjectorModel = function (args) {
        var self = this;
        self.tracker = ko.observable();
        self.contents = ko.observable();

        self.accept = function (resource) {
            if (self.tracker()) return false;

            self.contents(resource);

            self.tracker(new TimeTracker(20000, null, function () {
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

        self.params = (<any> Object).clone(args);

        self.tracker = new TimeTracker(10000, null, function (cancelToken: CancelToken) {
            var success = self.send(self.params.output, new ResourceModel("rock"));
            if (!success) cancelToken.cancel = true;
        }, true, self.params.running);

        self.start = function () {
            self.params.running = true;
            self.tracker.start();
        };

        self.stop = function () {
            self.params.running = false;
            self.tracker.stop();
        };

        self.shutDown = function () {
            self.tracker.stop();
        };
    };

    var ConstructorModel = function (args) {
        var self = this;

        self.params = (<any> Object).clone(args);
        self.fabricator = ko.observable();
        // self.nameToCreate = ko.observable("");

        self.formulas = ko.observableArray([
            { requirement: [{ type: "rock", quantity: 8 }], result: ["concrete"] },
            { requirement: [{ type: "iron", quantity: 99 }], result: ["iron"] }
        ]);

        self.items = ko.observableArray(makeArray(self.params.size, function () {
            return new InventorySlotModel(null);
        }));

        self.accept = function (resource) {
            if (self.fabricator()) return false;

            var emptySlot = self.items().find(item => !item.resource());  // sugar
            if (!emptySlot) return false;

            emptySlot.resource(resource);
            return true;
        };

        self.fabricate = function () {
            if (self.fabricator()) return; // already fabricating, can't start again

            self.fabricator(new TimeTracker(60000, null, function () {
                var materials = self.items().filter(slot => slot.resource())
                    .groupBy(slot => slot.resource().type);

                var matched = ko.utils.unwrapObservable(self.formulas).find(function (formula) {
                    return formula.requirement.all(function (ingredient) {
                        return materials[ingredient.type] && materials[ingredient.type].length >= ingredient.quantity;
                    });
                });

                if (matched) {
                    matched.result.forEach(function (produced) {
                        var newResource = new ResourceModel(produced);
                        self.send(self.params.output, newResource);
                    });
                    Notifications.show("'" + self.name + "' produced " + matched.result.join(", ") + ".");
                } else {
                    Notifications.show("'" + self.name + "' did not produce anything of value.");
                }

                self.items().forEach(slot => { slot.resource(null); });
                self.fabricator(null);
            }));
        };

        self.setDeviceInfo = function (deviceInfo) {
            self.items().zip(deviceInfo.items).forEach(function (tuple) {
                var slot = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        };

        self.shutDown = function () {
            self.fabricator.stop();
        };
    };

    var DeviceCollectionModel = function () {
        var self = this;
        var prefix = "mechanize_";
        var devices = {};

        self.getDevices = function () {
            return (<any> Object).values(devices); // sugar
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
            return self.all().filter(d => d.uistate() === "detached");
        });

        self.invalidateObservable = function () {
            invalidationToken.notifySubscribers(null);
        };

        self.getDevice = function (name) {
            return devices[prefix + name];
        };

        self.destroyDevice = function (name) {
            var device = devices[prefix + name];
            if (!device) {
                Notifications.show("Failed to destroy '" + name + "' because it does not exist.");
                return false;
            }

            if (device.indestructible) {
                Notifications.show("Failed to destroy '" + name + "' because it is indestructible.");
                return false;
            }

            if ((<any> Object).isFunction(device.shutDown)) device.shutDown(); // sugar

            delete devices[prefix + name];
            self.invalidateObservable();
            return true;
        };

        self.createDevice = function (name: string, type: string, args) {
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
                    case "Constructor":
                        return new ConstructorModel(args);
                    default:
                        throw new RangeError("Cannot create a device of type " + type);
                }
            };
            if (self.getDevice(name)) {
                Notifications.show("Failed to create '" + name + "' because it already exists.");
                return;
            }
            var device = constructDevice(type, args);
            (<any> Object).merge(device, { // sugar
                name: name,
                type: type,
                uistate: ko.observable("expanded"),
                collapse: function () { device.uistate("collapsed"); },
                expand: function () { device.uistate("expanded"); },
                detach: function () { device.uistate("detached"); },
                toggleCollapse: function () {
                    var state = { "collapsed": "expanded", "expanded": "collapsed" }[device.uistate()];
                    if (state) device.uistate(state);
                },
                send: function (receiverName, item) {
                    var receiver = self.getDevice(receiverName);
                    if (!receiver) return false;

                    if (!self.getDevice(name)) {
                        kill("'" + name + "' attempted to send, but it doesn't exist.");
                    }

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

        self.toJSON = function () {
            return ko.toJS(self.all());
        };
    };

    var created = false;
    var MechanizeViewModel = function () {
        if (created) kill("Must not call MechanizeViewModel more than once.");
        created = true;
        var self = this;

        self.player = new PlayerModel("Bob");
        self.devices = new DeviceCollectionModel();
        self.options = new OptionsModel();
        self.modelVersion = "0.1.0";
        self.build = "{{@build}}";
        self.notifications = Notifications; // has to be part of viewmodel so knockout events can be bound

        self.initializeGame = function () {
            self.devices.createDevice("Cargo Hold", "Inventory", { size: 16, outputs: ["Airlock", "Fabrication Lab"] });
            self.devices.createDevice("Airlock", "TrashEjector");
            self.devices.createDevice("Fabrication Lab", "Constructor", { size: 8, output: "Cargo Hold" });
            self.devices.createDevice("Resource Mining", "Wastes", { size: 32, output: "Cargo Hold", randomize: true }).detach();
            //self.devices.createDevice("Rock Collector Bot", "RockCollector", {output: "Cargo Hold"});
        };
    };

    window.addEventListener("load", function () {
        var arrangeAllPanels = function () {
            var top = 0, left = 0;
            var totalHeight = $("#gameSurface").height();

            $("#gameSurface .panel").forEach(function (panel) {
                var $panel = $(panel), height = $panel.height();

                if (top + height > totalHeight) {
                    top = 0;
                    left += $panel.width();
                }

                $panel.css({ top: top + "px", left: left + "px" });
                top += height;
            });
        };

        var load = function (model, saved, path?) {
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
                        savedVal.forEach(addDevice.bind(null, model[key]));

                    } else {
                        load(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
                    }
                }
            }
        };

        var serialized: string = window.localStorage.getItem('mechanize');
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

                Notifications.show("Initialized mechanize version " + mechanize.modelVersion + ".  Welcome.");
            } catch (e) {
                console.log(e.message);
                console.log(e.stack);
                kill("Failed to set up game.");
                return;
            }
        }

        (function registerGameSurfaceDomObserver() {
            var dragDropBindings = [];

            var bringToFront = function (element: HTMLElement) {
                var maxZ = $("#gameSurface .panel").get().map(function (panel) {
                    return parseInt(panel.style.zIndex, 10) || 0;
                }).max();
                $(element).css("z-index", maxZ + 1).removeClass("error");
            };

            var makeDraggable = function (node: HTMLElement) {
                if (node.classList && node.classList.contains("panel")) {
                    var $node = $(node);
                    var handle = $node.find("h2")[0];
                    var options = {
                        anchor: handle,
                        boundingBox: 'offsetParent',
                        dragstart: bringToFront.bind(null, node)
                    };
                    bringToFront(node);
                    var newLeft = $("#gameSurface .panel").get().map(function (panel) {
                        return parseInt(panel.style.left, 10) + $(panel).width() || 0;
                    }).max();
                    var farRight = $("#gameSurface").width() - $node.width();
                    $node.css("left", Math.min(newLeft, farRight) + "px");

                    var binding = DragDrop.bind(node, options);
                    (<any> Object).merge(binding, { element: node }); // sugar
                    dragDropBindings.push(binding);
                }
            };

            var unmakeDraggable = function (node) {
                var binding = dragDropBindings.find(function (b) {
                    return b.element === node;
                });
                if (!binding) return;
                DragDrop.unbind(binding);
            };

            var observer = new (<any> MutationObserver)(function (mutations) {
                mutations.forEach(function (mutation) {
                    Array.prototype.forEach.call(mutation.addedNodes, makeDraggable);
                    Array.prototype.forEach.call(mutation.removedNodes, unmakeDraggable);
                });
            });

            $("#gameSurface .panel").forEach(makeDraggable);
            observer.observe($("#gameSurface")[0], { childList: true });
        })();
        arrangeAllPanels();

        $("body").on("click", "#saveButton", saveModel);

        $("body").on("click", "#resetButton", function (e: Event) {
            var $controls = $("#gameControls > *").hide();

            var $yes = $("<button />").addClass("warning").text("yes");
            var $no = $("<button />").text("no");

            var $confirmation = $("<div />").text("Reset and lose all data?").append($yes).append($no);
            $("#gameControls").append($confirmation);

            $no.on("click", e => {
                $confirmation.remove();
                $controls.show();
                return true;
            });

            $yes.on("click", e => {
                window.localStorage.removeItem('mechanize');
                window.location.reload();
                return true;
            });

            return true;
        });

        $("body").on("click", "#arrangePanelsButton", makeHandler(arrangeAllPanels));

        $("body").on("click", ".collapser.auto",
            makeHandler(() => { $(this).toggleClass("expanded").toggleClass("collapsed"); }));

        $("#notificationsButton").on("click",
            makeHandler(() => { $("#notificationsLog").toggle(); }));

        $("#notifications").on("click", ".notification",
            makeHandler(() => { $(this).remove(); }));

        $("header .max-toggle").on("click",
            makeHandler(() => { $(this).toggleClass("active").parent().toggleClass("maxed"); }));

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
}
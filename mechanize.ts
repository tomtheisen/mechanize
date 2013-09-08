//# sourceMappingURL=mechanize.js.map
/// <reference path="typescript refs\sugar.d.ts" />
/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />
/// <reference path="utils.ts" />

// dependencies
//  knockout
//  sugarjs
//  zepto
//  DragDrop

declare var DragDrop;

module Mechanize {
    export var mechanize;

    class Unserializable {
        toJSON() { return undefined; }
    }

    class ResourceModel {
        type: string;

        constructor(type: string) {
            this.type = type;
        }
    }

    class PlayerModel {
        name: string;

        constructor(name: string) {
            this.name = name;
        }
    }

    class OptionsModel {
        autosave: KnockoutObservable<boolean>;
        visualEffects: KnockoutObservable<boolean>;

        constructor() {
            this.autosave = ko.observable(false);

            var autosaveIntervalId: number;
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

    function saveModel(e: Event) {
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

    module Notifications {
        export var log = ko.observableArray([]);
        export var shown = ko.observable(false);

        export function toJSON() { return undefined; }
        export function show(message: string) {
            log.push(message);
            if (ko.utils.unwrapObservable(log).length > 20) {
                log.shift();
            }

            var $notification = $("<div />").addClass("notification").text(message)
                .appendTo("#notifications");

            var args = { "max-height": "0px", "max-width": "0px", opacity: 0 };
            window.setTimeout(function () {
                $notification.animate(args, 4000, "ease", () => { $notification.remove(); });
            }, 10000);
        }
    }

    class TimeTracker {
        elapsedms = ko.observable(0);
        totalms: number;
        progress: KnockoutObservable<number>;
        completed = ko.observable(false);

        private intervalId: number;
        private updatems: number;
        private completeCallback: () => boolean;
        private repeat: boolean;

        stop() {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = null;
        }

        start() {
            this.stop();
            this.elapsedms(0);
            this.completed(false);

            var _this = this;
            this.intervalId = setInterval(this.tick.bind(this), this.updatems);
        }

        private tick() {
            if (killed) return;

            this.elapsedms(this.elapsedms() + this.updatems);

            if (this.elapsedms() >= this.totalms) {
                this.stop();
                this.elapsedms(this.totalms);
                this.completed(true);

                var cancel = this.completeCallback && this.completeCallback() === false;
                if (this.repeat && cancel) this.start();
            }
        }

        toJSON() {
            return (<any> Object).reject(ko.toJS(self), 'progress'); // sugar
        }

        constructor(totalms: number, updatems: number, complete: () => boolean, repeat: boolean = false, autostart: boolean = true) {
            var _this = this;

            this.updatems = updatems || 1000;
            this.totalms = totalms;
            this.progress = ko.computed(() => _this.elapsedms() / _this.totalms);
            this.completeCallback = complete;
            this.repeat = repeat;

            this.progress["marginRight"] = ko.computed(() => (100 - 100 * this.progress()) + '%');
            this.progress["remainingFormatted"] = ko.computed(function () {
                var seconds = (totalms - _this.elapsedms()) / 1000;
                return Utils.getFormattedTimespan(Math.round(seconds));
            });

            if (autostart) this.start();
        }
    }

    interface ResourceHolder {
        resource: KnockoutObservable<ResourceModel>;
    }

    class InventorySlotModel implements ResourceHolder {
        resource: KnockoutObservable<ResourceModel>;
        active = ko.observable(false);

        constructor(resource: ResourceModel) {
            this.resource = ko.observable(resource);
        }

        toJSON() {
            return (<any> Object).reject(ko.toJS(self), 'active'); // sugar
        }
    }

    class Device {
        params: any;    // used in device serialization to restore state
        deviceCollection: DeviceCollectionModel;

        constructor(deviceCollection: DeviceCollectionModel, args) {
            this.params = (<any> Object).clone(args); // sugar
            this.deviceCollection = deviceCollection;
        }

        accept(resource: ResourceModel) {
            return false;
        }

        setDeviceInfo(deviceInfo) {
            throw new Error("setDeviceInfo not implemented.");
        }

        name: string;
        type: string;
        uistate = ko.observable("expanded");

        collapse() { this.uistate("collapsed"); }
        expand() { this.uistate("expanded"); }
        detach() { this.uistate("detached"); }

        toggleCollapse() {
            var state = { "collapsed": "expanded", "expanded": "collapsed" }[this.uistate()];
            if (state) this.uistate(state);
        }

        send(receiverName: string, item: ResourceModel) {
            var receiver = this.deviceCollection.getDevice(receiverName);
            if (!receiver) return false;

            if (!this.deviceCollection.getDevice(name)) {
                kill("'" + name + "' attempted to send, but it doesn't exist.");
            }

            var success = receiver.accept && receiver.accept(item);
            var $receiver = $("[data-device='" + receiverName + "']");
            var $sender = $("[data-device='" + name + "']");
            if (success) {
                $receiver.addClass("bumped");
                window.setTimeout(() => $receiver.removeClass("bumped"), 1000);
            } else {
                $sender.addClass("error");
                Notifications.show("Failed to send item from " + name + " to " + receiverName + ".");
            }

            return success;
        }

    }

    class InventoryModel extends Device {
        outputs: KnockoutObservableArray<string>;
        activeItem: KnockoutObservable<InventorySlotModel> = ko.observable();
        items: KnockoutObservableArray<InventorySlotModel>;

        deactivate() {
            if (!this.activeItem()) return;

            this.activeItem().active(false);
            this.activeItem(null);
        }

        accept(resource: ResourceModel) {
            var emptySlot = this.items().find(item => !item.resource()); // sugar
            if (!emptySlot) return false;

            emptySlot.resource(resource);
            return true;
        }

        select(item: InventorySlotModel) {
            if (!item.resource()) return;

            var alreadyActive = item.active();
            this.deactivate();

            if (!alreadyActive) {
                this.activeItem(item);
                item.active(true);
            } else {
                item.active(false);
            }
        }

        popActive(): ResourceModel {
            var active = this.activeItem();
            if (!active) return null;

            this.activeItem(null);
            active.active(false);
            var resource = active.resource();
            active.resource(null);
            return resource;
        }

        sendActiveTo(receiverName: string) {
            var success = this.send(receiverName, this.activeItem().resource());
            if (success) this.popActive();
        }

        setDeviceInfo(deviceInfo) {
            this.items().zip(deviceInfo.items).forEach(function (tuple) {
                var slot = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);
            this.outputs = ko.observableArray(args.outputs);
            this.params.outputs = this.outputs;

            this.items = ko.observableArray(Utils.makeArray(args.size, () => new InventorySlotModel(null)));
        }
    }

    class WastesModel extends Device {
        junk: KnockoutObservableArray<ResourceHolder>;
        regenerateJunk() {
            var rnd = Math.random(), type;
            if (rnd < 0.05) {
                type = "iron";
            } else {
                type = "rock";
            }

            var idx = Math.floor(Math.random() * this.junk().length);
            this.junk()[idx].resource(new ResourceModel(type));
        }

        regenerator = ko.observable(new TimeTracker(15000, null, () => { this.regenerateJunk(); return true; }, true));

        collect(wasteCell) {
            if (!wasteCell.resource()) return;

            var success = this.send(this.params.output, wasteCell.resource());
            if (success) wasteCell.resource(null);
            return success;
        }

        shutDown() {
            this.regenerator().stop();
        }

        setDeviceInfo(deviceInfo) {
            console.log("todo: WastesModel setDeviceInfo");
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);

            this.junk = ko.observableArray(Utils.makeArray(args.size, () => { return { resource: ko.observable() }; }));

            if (args.randomize) {
                for (var i = 0; i < this.junk().length / 2; i++) {
                    this.regenerateJunk();
                }

                this.params.randomize = false;
            }
        }
    }

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
                return true;
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

        self.tracker = new TimeTracker(10000, null, function () {
            return self.send(self.params.output, new ResourceModel("rock"));
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

        self.items = ko.observableArray(Utils.makeArray(self.params.size, () => new InventorySlotModel(null)));

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

                return true;
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

    class DeviceCollectionModel extends Unserializable {
        prefix = "mechanize_";
        devices = {};

        getDevices(): Device[] {
            return (<any> Object).values(this.devices); // sugar
        }

        invalidationToken = ko.observable(0);
        invalidateObservable() {
            this.invalidationToken.notifySubscribers(null);
        }

        all = ko.computed(() => {
            this.invalidationToken();
            return this.getDevices();
        });

        attached = ko.computed(() => this.all().filter(d => ["expanded", "collapsed"].any(d.uistate()))); // sugar
        detached = ko.computed(() => this.all().filter(d => d.uistate() === "detached")); // sugar

        getDevice(name: string) {
            return this.devices[this.prefix + name];
        }

        destroyDevice(name: string) {
            var device = this.devices[this.prefix + name];
            if (!device) {
                Notifications.show("Failed to destroy '" + name + "' because it does not exist.");
                return false;
            }

            if (device.indestructible) {
                Notifications.show("Failed to destroy '" + name + "' because it is indestructible.");
                return false;
            }

            if ((<any> Object).isFunction(device.shutDown)) device.shutDown(); // sugar

            delete this.devices[this.prefix + name];
            this.invalidateObservable();
            return true;
        }

        createDevice(name: string, type: string, args): Device {
            var constructDevice = function (type: string, args) {
                switch (type) {
                    case "TrashEjector":
                        return new TrashEjectorModel(args);
                    case "RockCollector":
                        return new RockCollectorModel(args);
                    case "Inventory":
                        return new InventoryModel(this, args);
                    case "Wastes":
                        return new WastesModel(this, args);
                    case "Constructor":
                        return new ConstructorModel(args);
                    default:
                        throw new RangeError("Cannot create a device of type " + type);
                }
            };
            if (this.getDevice(name)) {
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
                    var receiver = this.getDevice(receiverName);
                    if (!receiver) return false;

                    if (!this.getDevice(name)) {
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

            this.devices[this.prefix + name] = device;
            this.invalidateObservable();
            return device;
        }

        removeDevice(name: string) {
            delete this.devices[this.prefix + name];
            this.invalidateObservable();
        }

        removeAll() {
            this.devices = {};
            this.invalidateObservable();
        }
    }

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

        $("body").on("click", "#arrangePanelsButton", Utils.makeHandler(arrangeAllPanels));

        $("body").on("click", ".collapser.auto",
            Utils.makeHandler(() => { $(this).toggleClass("expanded").toggleClass("collapsed"); }));

        $("#notificationsButton").on("click",
            Utils.makeHandler(() => { $("#notificationsLog").toggle(); }));

        $("#notifications").on("click", ".notification",
            Utils.makeHandler(() => { $(this).remove(); }));

        $("header .max-toggle").on("click",
            Utils.makeHandler(() => { $(this).toggleClass("active").parent().toggleClass("maxed"); }));

        $("#systemMessage").hide();
        $("#gameSurface").css("visibility", "");
    });
}
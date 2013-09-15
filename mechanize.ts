/// <reference path="typescript refs\sugar.d.ts" />
/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="utils.ts" />
/// <reference path="interface.ts" />

// dependencies
//  knockout
//  sugarjs
//  zepto
//  DragDrop

module Mechanize {
    var sugarObject = <ObjectStatic><any> Object; // for sugar methods on Object

    export class ResourceModel {
        constructor(public type: string) { }
    }

    export class PlayerModel {
        constructor(public name: string) { }
    }

    export class OptionsModel {
        autosave = ko.observable(false);
        visualEffects = ko.observable(false);
        fullScreen = ko.observable(false);

        constructor() {
            var autosaveIntervalId: number;
            this.autosave.subscribe(function (autosave: boolean) {
                Notifications.show("Autosave is " + (autosave ? "on" : "off") + ".");

                if (autosaveIntervalId) clearInterval(autosaveIntervalId);
                if (autosave) autosaveIntervalId = window.setInterval(Interface.saveModel, 120000);
            });
            this.visualEffects.subscribe(function (vfx) {
                Notifications.show("Visual effects are " + (vfx ? "on" : "off") + ".");
                Interface.setVisualEffects(vfx);
            });
            this.fullScreen.subscribe(function (full) {
                Notifications.show("Fullscreen is " + (full ? "on" : "off") + ".");
                if (full) Utils.fullScreen();
                else Utils.exitFullScreen();
            });
        }

        toJSON() {
            return sugarObject.reject(ko.toJS(this), "fullScreen"); // sugar
        }
    }

    export class TimeTracker {
        elapsedms = ko.observable(0);
        progress: KnockoutObservable<number>;
        running = ko.observable(false);

        private intervalId: number;
        private completeCallback: () => boolean;

        stop() {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = null;
            this.running(false);
        }

        start() {
            this.stop();
            this.elapsedms(0);
            this.running(true);

            this.intervalId = setInterval(this.tick.bind(this), this.updatems);
        }

        private tick() {
            if (Interface.killed) return;

            this.elapsedms(this.elapsedms() + this.updatems);

            if (this.elapsedms() >= this.totalms) {
                this.stop();
                this.elapsedms(this.totalms);

                var cancel = this.completeCallback && this.completeCallback() === false;
                if (this.repeat && !cancel) this.start();
            }
        }

        toJSON() {
            return sugarObject.reject(ko.toJS(this), "progress", "intervalId"); // sugar
        }

        setInfo(serialized) {
            this.updatems = serialized.updatems;
            this.totalms = serialized.totalms;
            this.repeat = serialized.repeat;

            if (serialized.running) this.start(); else this.stop();
            this.elapsedms(serialized.elapsedms);
        }

        constructor(public totalms: number, complete: () => boolean, private repeat: boolean = false, private updatems: number = 1000, autostart: boolean = true) {
            this.progress = ko.computed(() => this.elapsedms() / this.totalms);
            this.completeCallback = complete;

            this.progress["marginRight"] = ko.computed(() => (100 - 100 * this.progress()) + "%");
            this.progress["remainingFormatted"] = ko.computed(() => {
                var seconds = (this.totalms - this.elapsedms()) / 1000;
                return Utils.getFormattedTimespan(Math.round(seconds));
            });

            if (autostart) this.start();
        }
    }

    export interface ResourceHolder {
        resource: KnockoutObservable<ResourceModel>;
    }

    export class InventorySlotModel implements ResourceHolder {
        resource: KnockoutObservable<ResourceModel>;
        active = ko.observable(false);

        constructor(resource: ResourceModel) {
            this.resource = ko.observable(resource);
        }

        toJSON() {
            return sugarObject.reject(ko.toJS(this), "active"); // sugar
        }
    }

    enum DeviceUIState {
        collapsed,
        expanded,
        detached,
    }

    export class Device {
        params: any;    // used in device serialization to restore state
        name: string;
        type: string;
        uistate = ko.observable(DeviceUIState[DeviceUIState.expanded]);
        indestructible = false;

        constructor(public deviceCollection: DeviceCollectionModel, args) {
            this.params = sugarObject.clone(args); // sugar
            this.expand();
        }

        accept(resource: ResourceModel) {
            return false;
        }

        setDeviceInfo(deviceSerialized) {
            throw new Error("abstract setDeviceInfo not implemented.");
        }

        private _uistate: DeviceUIState;
        private set UIState(state: DeviceUIState) {
            this.uistate(DeviceUIState[this._uistate = state]);
        }
        private get UIState() { return this._uistate; }

        collapse() { this.UIState = DeviceUIState.collapsed; }
        expand() { this.UIState = DeviceUIState.expanded; }
        detach() { this.UIState = DeviceUIState.detached; }

        toggleCollapse() {
            var currentState = this.UIState;
            if (currentState === DeviceUIState.collapsed) this.UIState = DeviceUIState.expanded;
            else if (currentState === DeviceUIState.expanded) this.UIState = DeviceUIState.collapsed;
        }

        send(receiverName: string, item: ResourceModel) {
            var receiver = this.deviceCollection.getDevice(receiverName);
            if (!receiver) return false;

            if (!this.deviceCollection.getDevice(this.name)) {
                Interface.kill(this.name + " attempted to send, but it doesn't exist.");
            }

            var success = receiver.accept(item);
            if (success) {
                Interface.bumpDevice(receiverName);
            } else {
                Interface.errorDevice(this.name);
                Notifications.show("Failed to send item from " + this.name + " to " + receiverName + ".");
            }

            return success;
        }

        shutDown() { } // for overloading

        toJSON(): any {
            return {
                type: this.type,
                name: this.name,
                indestructible: this.indestructible,
                uistate: this.uistate,
                params: this.params,
            };
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

        select = (item: InventorySlotModel) => {
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

        sendActiveTo = (receiverName: string) => {
            var success = this.send(receiverName, this.activeItem().resource());
            if (success) this.popActive();
        }

        setDeviceInfo(deviceSerialized) {
            this.items().zip(deviceSerialized.items).forEach(function (tuple) {
                var slot: InventorySlotModel = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        }

        toJSON() {
            return sugarObject.merge(super.toJSON(), { items: this.items });
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);
            this.outputs = ko.observableArray(args.outputs);
            this.params.outputs = this.outputs;

            this.items = ko.observableArray(Utils.makeArray(args.size, () => new InventorySlotModel(null)));
        }
    }

    class WastesSlotModel implements ResourceHolder {
        events = ko.observable();
        resource: KnockoutObservable<ResourceModel> = ko.observable();
        collectionDelay: KnockoutObservable<number> = ko.observable();
    }

    class WastesModel extends Device {
        slots: KnockoutObservableArray<WastesSlotModel>;

        warp() {
            var rnd = Math.random(), type: string, delay: number;
            if (rnd < 0.05) {
                type = "iron";
                delay = 10000;
            } else {
                type = "rock";
                delay = 5000;
            }

            var idx = Math.floor(Math.random() * this.slots().length);
            this.slots()[idx].resource(new ResourceModel(type));
            this.slots()[idx].collectionDelay(delay);
        }

        regenerator = ko.observable(new TimeTracker(60000, () => { this.warp(); return true; }, true));

        collect = (wasteCell: WastesSlotModel) => {
            if (!wasteCell.resource()) return;

            var success = this.send(this.params.output, wasteCell.resource());
            this.collecting = false; 
            if (success) {
                wasteCell.resource(null);
                wasteCell.collectionDelay(null);
            }
            return success;
        }

        private collecting = false;
        startCollect = (wasteCell: WastesSlotModel) => {
            if (this.collecting) return;
            this.collecting = true;

            var delay : number = wasteCell.collectionDelay();
            setTimeout(this.collect.bind(this, wasteCell), delay);
            wasteCell.events.notifySubscribers({ delay: delay, reset: true }, "startcollect");
        }

        shutDown() {
            this.regenerator().stop();
        }

        setDeviceInfo(deviceSerialized) {
            this.slots().zip(deviceSerialized.slots).forEach(function (tuple) {
                var slot: WastesSlotModel = tuple[0], newItem = tuple[1];
                var resource: ResourceModel = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
                slot.collectionDelay(newItem.collectionDelay);
            });
            this.regenerator().setInfo(deviceSerialized.regenerator);
        }

        toJSON() {
            return sugarObject.merge(super.toJSON(), { slots: this.slots, regenerator: this.regenerator });
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);

            this.slots = ko.observableArray(Utils.makeArray(args.size, () => new WastesSlotModel()));

            if (args.randomize) {
                for (var i = 0; i < this.slots().length / 2; i++) {
                    this.warp();
                }

                this.params.randomize = false;
            }
        }
    }

    class TrashEjectorModel extends Device {
        tracker: KnockoutObservable<TimeTracker> = ko.observable();
        contents: KnockoutObservable<ResourceModel> = ko.observable();

        eject = () => {
            this.contents(null);
            this.tracker(null);
            return true;
        };

        accept(resource: ResourceModel) {
            if (this.tracker()) return false;

            this.contents(resource);
            this.tracker(new TimeTracker(20000, this.eject));

            return true;
        }

        setDeviceInfo(deviceSerialized) {
            if (deviceSerialized.contents) {
                this.accept(new ResourceModel(deviceSerialized.contents.type));
                this.tracker().setInfo(deviceSerialized.tracker);
            }
        }

        toJSON() {
            return sugarObject.merge(super.toJSON(), { contents: this.contents, tracker: this.tracker });
        }
    }

    class RockCollectorModel extends Device {
        tracker: TimeTracker;

        start() {
            this.params.running = true;
            this.tracker.start();
        }

        stop() {
            this.params.running = false;
            this.tracker.stop();
        }

        shutDown() {
            this.tracker.stop();
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);

            this.tracker = new TimeTracker(10000, function () {
                return this.send(this.params.output, new ResourceModel("rock"));
            }, true, undefined, this.params.running);
        }
    }

    class ConstructorModel extends Device {
        fabricator: KnockoutObservable<TimeTracker> = ko.observable();
        formulas = ko.observableArray([
            { requirement: [{ type: "rock", quantity: 8 }], result: ["concrete"] },
            { requirement: [{ type: "iron", quantity: 99 }], result: ["iron"] }
        ]);
        items: KnockoutObservableArray<InventorySlotModel>;

        accept(resource: ResourceModel) {
            if (this.fabricator()) return false;

            var emptySlot = this.items().find(item => !item.resource());  // sugar
            if (!emptySlot) return false;

            emptySlot.resource(resource);
            return true;
        }

        fabricate() {
            if (this.fabricator()) return; // already fabricating, can't start again

            this.fabricator(new TimeTracker(60000, () => {
                var materials = this.items().filter(slot => !!slot.resource())
                    .groupBy(slot => slot.resource().type);

                var matched = this.formulas().find(function (formula) {
                    return formula.requirement.all(function (ingredient) {
                        return materials[ingredient.type] && materials[ingredient.type].length >= ingredient.quantity;
                    });
                });

                if (matched) {
                    matched.result.forEach(produced => {
                        var newResource = new ResourceModel(produced);
                        this.send(this.params.output, newResource);
                    });
                    Notifications.show(this.name + " produced " + matched.result.join(", ") + ".");
                } else {
                    Notifications.show(this.name + " did not produce anything of value.");
                }

                this.items().forEach(slot => { slot.resource(null); });
                this.fabricator(null);

                return true;
            }));
        }

        setDeviceInfo(deviceSerialized) {
            this.items().zip(deviceSerialized.items).forEach(function (tuple) {
                var slot = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
            if (deviceSerialized.fabricator) {
                this.fabricate();
                this.fabricator().setInfo(deviceSerialized.fabricator);
            }
        }

        toJSON() {
            return sugarObject.merge(super.toJSON(), { items: this.items, fabricator: this.fabricator });
        }

        shutDown() {
            this.fabricator().stop();
        }

        constructor(deviceCollection: DeviceCollectionModel, args) {
            super(deviceCollection, args);

            this.items = ko.observableArray(Utils.makeArray(args.size, () => new InventorySlotModel(null)));
        }
    }

    export class DeviceCollectionModel {
        private devices = Object.create(null);

        getDevices(): Device[] {
            return sugarObject.values(this.devices); // sugar
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

        getDevice(name: string): Device {
            return this.devices[name];
        }

        destroyDevice(name: string) {
            var device = this.getDevice(name);
            if (!device) {
                Notifications.show("Failed to destroy " + name + " because it does not exist.");
                return false;
            }

            if (device.indestructible) {
                Notifications.show("Failed to destroy " + name + " because it is indestructible.");
                return false;
            }

            if (typeof(device.shutDown) === "function") device.shutDown();

            delete this.devices[name];
            this.invalidateObservable();
            return true;
        }

        createDevice(name: string, type: string, args?): Device {
            var constructDevice = function (collection: DeviceCollectionModel, type: string, args): Device {
                switch (type) {
                    case "TrashEjector":
                        return new TrashEjectorModel(collection, args);
                    case "RockCollector":
                        return new RockCollectorModel(collection, args);
                    case "Inventory":
                        return new InventoryModel(collection, args);
                    case "Wastes":
                        return new WastesModel(collection, args);
                    case "Constructor":
                        return new ConstructorModel(collection, args);
                    default:
                        throw new RangeError("Cannot create a device of type " + type);
                }
            };
            if (this.getDevice(name)) {
                Notifications.show("Failed to create " + name + " because it already exists.");
                return;
            }
            var device = constructDevice(this, type, args);
            device.name = name;
            device.type = type;

            this.devices[name] = device;
            this.invalidateObservable();
            return device;
        }

        removeAll() {
            this.devices = Object.create(null);
            this.invalidateObservable();
        }

        toJSON() {
            return this.getDevices();
        }
    }

    export module Notifications {
        export var log = ko.observableArray([]);

        export function toJSON() { return undefined; }
        export function show(message: string) {
            log.push(message);
            if (ko.utils.unwrapObservable(log).length > 20) log.shift();
            Interface.showNotification(message);
        }
    }

    export module MechanizeViewModel {
        export var player: PlayerModel = new PlayerModel("Bob");
        export var devices = new DeviceCollectionModel();
        export var options = new OptionsModel();
        export var modelVersion = "0.1.0";
        export var build = "{{@build}}";
        export var notifications = Notifications; // has to be part of viewmodel so knockout events can be bound

        function initializeGame() {
            devices.createDevice("Cargo Hold", "Inventory", { size: 16, outputs: ["Airlock", "Fabrication Lab"] });
            devices.createDevice("Airlock", "TrashEjector");
            devices.createDevice("Fabrication Lab", "Constructor", { size: 8, output: "Cargo Hold" });
            devices.createDevice("Resource Mining", "Wastes", { size: 32, output: "Cargo Hold", randomize: true }).detach();
        }

        function loadGame(model, saved, path?: string) {
            var addDevice = function (deviceCollection, deviceInfo) {
                var device = deviceCollection.createDevice(
                    deviceInfo.name, deviceInfo["type"], deviceInfo.params);

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
                        loadGame(ko.utils.unwrapObservable(model[key]), savedVal, newPath);
                    }
                }
            }
        }

        var started = false;
        export function loadOrInitialize() {
            if (started) throw new Error("Attempted to start MechanieViewModel twice");
            started = true;

            var serialized = window.localStorage.getItem('mechanize');

            if (serialized) {
                var saved = JSON.parse(serialized);
                loadGame(MechanizeViewModel, saved);
                ko.applyBindings(MechanizeViewModel);

                Notifications.show("Loaded successfully.");
            } else {
                initializeGame();
                ko.applyBindings(MechanizeViewModel);

                Notifications.show("Initialized mechanize version " + MechanizeViewModel.modelVersion + ".  Welcome.");
            }
        }
    }
}

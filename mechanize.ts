/// <reference path="typescript refs\sugar.d.ts" />
/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />
/// <reference path="utils.ts" />

// dependencies
//  knockout
//  sugarjs
//  zepto
//  DragDrop

module Mechanize {
    export class ResourceModel {
        type: string;

        constructor(type: string) {
            this.type = type;
        }
    }

    export class PlayerModel {
        name: string;

        constructor(name: string) {
            this.name = name;
        }
    }

    export class OptionsModel {
        autosave: KnockoutObservable<boolean>;
        visualEffects: KnockoutObservable<boolean>;

        constructor() {
            this.autosave = ko.observable(false);

            var autosaveIntervalId: number;
            this.autosave.subscribe(function (autosave: boolean) {
                Interface.Notifications.show("Autosave is " + (autosave ? "on" : "off") + ".");

                if (autosaveIntervalId) clearInterval(autosaveIntervalId);
                if (autosave) autosaveIntervalId = window.setInterval(Interface.saveModel, 120000);
            });

            this.visualEffects = ko.observable(false);
            this.visualEffects.subscribe(function (vfx) {
                Interface.Notifications.show("Visual effects are " + (vfx ? "on" : "off") + ".");

                if (vfx) {
                    $("body").addClass("vfx");
                } else {
                    $("body").removeClass("vfx");
                }
            });
        }
    }

    export class TimeTracker {
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

            this.intervalId = setInterval(this.tick.bind(this), this.updatems);
        }

        private tick() {
            if (Interface.killed) return;

            this.elapsedms(this.elapsedms() + this.updatems);

            if (this.elapsedms() >= this.totalms) {
                this.stop();
                this.elapsedms(this.totalms);
                this.completed(true);

                var cancel = this.completeCallback && this.completeCallback() === false;
                if (this.repeat && !cancel) this.start();
            }
        }

        toJSON() {
            return (<any> Object).reject(ko.toJS(this), 'progress', 'intervalId'); // sugar
        }

        constructor(totalms: number, updatems: number, complete: () => boolean, repeat: boolean = false, autostart: boolean = true) {
            this.updatems = updatems || 1000;
            this.totalms = totalms;
            this.progress = ko.computed(() => this.elapsedms() / this.totalms);
            this.completeCallback = complete;
            this.repeat = repeat;

            this.progress["marginRight"] = ko.computed(() => (100 - 100 * this.progress()) + '%');
            this.progress["remainingFormatted"] = ko.computed(() => {
                var seconds = (totalms - this.elapsedms()) / 1000;
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
            return (<any> Object).reject(ko.toJS(this), 'active'); // sugar
        }
    }

    export class Device {
        params: any;    // used in device serialization to restore state
        deviceCollection: DeviceCollectionModel;
        name: string;
        type: string;
        uistate = ko.observable("expanded");
        indestructible = false;

        constructor(deviceCollection: DeviceCollectionModel, args) {
            this.params = (<any> Object).clone(args); // sugar
            this.deviceCollection = deviceCollection;
        }

        accept(resource: ResourceModel) {
            return false;
        }

        setDeviceInfo(deviceSerialized) {
            throw new Error("abstract setDeviceInfo not implemented.");
        }

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

            if (!this.deviceCollection.getDevice(this.name)) {
                Interface.kill("'" + this.name + "' attempted to send, but it doesn't exist.");
            }

            var success = receiver.accept && receiver.accept(item);
            var $receiver = $("[data-device='" + receiverName + "']");
            var $sender = $("[data-device='" + this.name + "']");
            if (success) {
                $receiver.addClass("bumped");
                window.setTimeout(() => $receiver.removeClass("bumped"), 1000);
            } else {
                $sender.addClass("error");
                Interface.Notifications.show("Failed to send item from " + this.name + " to " + receiverName + ".");
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
                var slot = tuple[0], newItem = tuple[1];
                var resource = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                slot.resource(resource);
            });
        }

        toJSON() {
            return (<any> Object).merge(super.toJSON(), { items: this.items });
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

        collect = (wasteCell) => {
            if (!wasteCell.resource()) return;

            var success = this.send(this.params.output, wasteCell.resource());
            if (success) wasteCell.resource(null);
            return success;
        }

        shutDown() {
            this.regenerator().stop();
        }

        setDeviceInfo(deviceSerialized) {
            this.junk().zip(deviceSerialized.junk).forEach(function (tuple) {
                var holder: ResourceHolder = tuple[0], newItem = tuple[1];
                var resource: ResourceModel = newItem.resource && new ResourceModel(newItem.resource.type) || null;
                holder.resource(resource);
            });
        }

        toJSON() {
            return (<any> Object).merge(super.toJSON(), { junk: this.junk });
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

    class TrashEjectorModel extends Device {
        tracker: KnockoutObservable<TimeTracker> = ko.observable();
        contents: KnockoutObservable<ResourceModel> = ko.observable();

        accept(resource: ResourceModel) {
            if (this.tracker()) return false;

            this.contents(resource);

            this.tracker(new TimeTracker(20000, null, function () {
                this.contents(null);
                this.tracker(null);
                return true;
            }));

            return true;
        }

        setDeviceInfo(deviceSerialized) {
            if (deviceSerialized.contents) {
                this.accept(new ResourceModel(deviceSerialized.contents.type));
            }
        }

        toJSON() {
            return (<any> Object).merge(super.toJSON(), { contents: this.contents });
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

            this.tracker = new TimeTracker(10000, null, function () {
                return this.send(this.params.output, new ResourceModel("rock"));
            }, true, this.params.running);
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

            this.fabricator(new TimeTracker(60000, null, () => {
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
                    Interface.Notifications.show("'" + this.name + "' produced " + matched.result.join(", ") + ".");
                } else {
                    Interface.Notifications.show("'" + this.name + "' did not produce anything of value.");
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
        }

        toJSON() {
            return (<any> Object).merge(super.toJSON(), { items: this.items });
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
            var device : Device = this.devices[this.prefix + name];
            if (!device) {
                Interface.Notifications.show("Failed to destroy '" + name + "' because it does not exist.");
                return false;
            }

            if (device.indestructible) {
                Interface.Notifications.show("Failed to destroy '" + name + "' because it is indestructible.");
                return false;
            }

            if (typeof(device.shutDown) === "function") device.shutDown(); 

            delete this.devices[this.prefix + name];
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
                Interface.Notifications.show("Failed to create '" + name + "' because it already exists.");
                return;
            }
            var device = constructDevice(this, type, args);
            device.name = name;
            device.type = type;

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

        toJSON() {
            return this.getDevices();
        }
    }

    var created = false;
    export class MechanizeViewModel {
        player: PlayerModel;
        devices = new DeviceCollectionModel();
        options = new OptionsModel();
        modelVersion = "0.1.0";
        build = "{{@build}}";
        notifications = Interface.Notifications; // has to be part of viewmodel so knockout events can be bound

        initializeGame() {
            this.devices.createDevice("Cargo Hold", "Inventory", { size: 16, outputs: ["Airlock", "Fabrication Lab"] });
            this.devices.createDevice("Airlock", "TrashEjector");
            this.devices.createDevice("Fabrication Lab", "Constructor", { size: 8, output: "Cargo Hold" });
            this.devices.createDevice("Resource Mining", "Wastes", { size: 32, output: "Cargo Hold", randomize: true }).detach();
        }

        constructor() {
            if (created) Interface.kill("Must not call MechanizeViewModel more than once.");
            created = true;

            this.player = new PlayerModel("Bob");
        }
    }
}

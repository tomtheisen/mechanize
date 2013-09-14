/// <reference path="utils.ts" />

declare var ko;

(function () {
    function setTitle(element: HTMLElement, valueAccessor: () => string) {
        element.title = valueAccessor();
    }

    ko.bindingHandlers.title = { init: setTitle, update: setTitle };

    var args: Array;
    ko.bindingHandlers.modelevent = {
        init: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            var value = valueAccessor();

            var event: string = value.event;
            var subscriber: Utils.PubSub<any> = value.subscriber;
            var handler: (...args) => any = value.handler;
            args = <Array> value.args;

            subscriber.subscribe(event, handler.bind(null, element));
        },
        update: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            args = valueAccessor().args;
        }
    };
})();
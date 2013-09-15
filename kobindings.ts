/// <reference path="typescript refs\knockout.d.ts" />

(function () {
    function setTitle(element: HTMLElement, valueAccessor: () => string) {
        element.title = valueAccessor();
    }

    ko.bindingHandlers["title"] = { init: setTitle, update: setTitle };

    ko.bindingHandlers["modelevent"] = {
        init: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            var value = valueAccessor();

            var event: string = value.event;
            var publisher: KnockoutObservable<any> = value.subscriber;
            var handler: (args) => any = value.handler;

            var subscription = publisher.subscribe(handler, element, event);
            ko.utils.domNodeDisposal.addDisposeCallback(element, () => subscription.dispose());
        },
    };
})();
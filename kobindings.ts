/// <reference path="typescript refs\knockout.d.ts" />
/// <reference path="typescript refs\zepto.d.ts" />

(function () {
    function setTitle(element: HTMLElement, valueAccessor: () => string) {
        element.title = valueAccessor();
    }

    ko.bindingHandlers["title"] = { init: setTitle, update: setTitle };

    ko.bindingHandlers["modelevent"] = {
        init: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            var value = valueAccessor();

            var event: string = value.event;
            var publisher: KnockoutObservable<any> = value.publisher;
            var handler: (args) => any = value.handler;

            var subscription = publisher.subscribe(handler, element, event);
            ko.utils.domNodeDisposal.addDisposeCallback(element, () => subscription.dispose());
        },
    };

    ko.bindingHandlers["switch"] = {
        init: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            $(element).children().hide().filter("[data-case='" + valueAccessor()() + "']").show();
        },
        update: function (element: HTMLElement, valueAccessor: () => any, allBindingsAccessor: () => any, viewModel, bindingContext) {
            $(element).children().hide().filter("[data-case='" + valueAccessor()() + "']").show();
        },
    };
})();
declare var ko;

ko.bindingHandlers.title = {
    init: (element: HTMLElement, valueAccessor: () => string) => { element.title = valueAccessor(); },
    update: (element: HTMLElement, valueAccessor: () => string) => { element.title = valueAccessor(); },
};


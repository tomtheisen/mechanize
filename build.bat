mkdir output\img
del /s /q output\*.*


copy knockout-2.3.0.js output\
copy knockout.mapping-latest.js output\
copy seedrandom.js output\
copy sugar-1.3.9.min.js output\
copy zepto.min.js output\

copy aldrich.woff output\

copy mechanize.js output\

copy img\*.* output\img\

copy index.html output\

dotless\dotless.compiler.exe style.less output\style.css
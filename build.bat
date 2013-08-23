mkdir output
del /s /q output\*.*

REM ***********  html  **************
	copy index.html output\

REM ***********  javascript  **************
	type knockout-2.3.0.js >> output\libs.js
	echo ; >> output\libs.js

	build\jsmin < seedrandom.js >> output\libs.js
	echo ; >> output\libs.js

	type sugar-1.3.9-custom.min.js >> output\libs.js
	echo ; >> output\libs.js

	type zepto.min.js >> output\libs.js
	echo ; >> output\libs.js

	copy mechanize.js output\
	rem build\jsmin < mechanize.js > output\mechanize.js

REM ***********  assets  **************
	copy aldrich.woff output\

REM ***********  less  **************
	build\dotless\dotless.compiler.exe -m style.less style.css
	c:\python27\python.exe build\assetinjector.py < style.css > output\style.css
	del style.css
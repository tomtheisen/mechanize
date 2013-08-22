mkdir output
del /s /q output\*.*

REM ***********  html  **************
	copy index.html output\

REM ***********  javascript  **************
	type knockout-2.3.0.js >> output\libs.js
	echo ; >> output\libs.js

	jsmin\jsmin < seedrandom.js >> output\libs.js
	echo ; >> output\libs.js

	type sugar-1.3.9.min.js >> output\libs.js
	echo ; >> output\libs.js

	type zepto.min.js >> output\libs.js
	echo ; >> output\libs.js

	copy mechanize.js output\

REM ***********  assets  **************
	copy aldrich.woff output\
	copy resource-tiles.png output\

REM ***********  less  **************
	dotless\dotless.compiler.exe -m style.less output\style.css
@echo off
echo Mechanize build

if not exist output mkdir output
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

	build\jsmin < drag-drop.js >> output\libs.js
	echo ; >> output\libs.js

	cmd /c "tsc --out output\mechanize.js kobindings.ts utils.ts mechanize.ts"
	build\buildnumber.py build.txt output\mechanize.js "{{@build}}"

REM ***********  assets  **************
	copy aldrich.woff output\

REM ***********  less  **************
	build\dotless\dotless.compiler.exe style.less style.css
	build\cssinjector.py -img < style.css > output\style.css
	del style.css

REM ***********  mini  **************
	if not exist outputmin mkdir outputmin
	del /s /q outputmin\*.*

	build\dotless\dotless.compiler.exe -m style.less style.css
	build\cssinjector.py -img -font < style.css > outputmin\style.css
	del style.css

	copy output\libs.js outputmin\
	build\jsmin < output\mechanize.js > outputmin\mechanize.js
	copy output\index.html outputmin\

	pushd .
		cd outputmin
		..\build\htmlinjector.py -script -css -minify < index.html > mechanize.html

		attrib +R mechanize.html
		del /q *.* 2>NUL
		attrib -R mechanize.html
	popd

echo Mechanize build complete.
type build.txt

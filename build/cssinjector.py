#!/usr/bin/python3
import sys, re, base64, argparse

argparser = argparse.ArgumentParser(description="Inject external url(...) resources into css file using data: uris. Standard input and output.", add_help=False)
argparser.add_argument("-img", "-image", action="append_const", dest="inject_types", const="image", help="Inject image assets.")
argparser.add_argument("-font", action="append_const", dest="inject_types", const="font", help="Inject font assets.")
args = argparser.parse_args()
if not args.inject_types:
	argparser.print_help()
	sys.exit()

def datalize(filename):
	ext = filename.rsplit(".", 1)[-1]
	mimes = {
		"jpg": ("image/jpeg", "image"),
		"jpeg": ("image/jpeg", "image"),
		"gif": ("image/gif", "image"),
		"png": ("image/png", "image"),
		"woff": ("application/font-woff", "font"),
	}

	mime = mimes.get(ext, (None, None))
	if mime[1] not in args.inject_types: return "url(%s)" % filename

	with open(filename, "rb") as f:
		encoded = base64.standard_b64encode(f.read())
		return "url(data:%s;base64,%s)" % (mime[0], encoded.decode())
	
pattern = r"""url\((?!data:)([^)]+|'[^']+'|"[^"]+")\)"""
for line in sys.stdin:
	print(re.sub(pattern, lambda m: datalize(m.group(1).strip("'"'"')), line.strip()))
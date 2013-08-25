#!/usr/bin/python3

from bs4 import BeautifulSoup
import sys, re, base64, argparse

argparser = argparse.ArgumentParser(description="Inject external resources into html files. Standard input and output.", add_help=False)
argparser.add_argument("-script", action="append_const", dest="inject_types", const=("script", "src", {}, None), help="Inject scripts.")
argparser.add_argument("-css", action="append_const", dest="inject_types", const=("link", "href", {"rel": "stylesheet"}, "style"), help="Inject css sheets.")
argparser.add_argument("-minify", action="store_const", dest="input_map", const=str.strip, default=lambda x:x, help="Minify output. (currently remove leading and trailing whitespace and linebreaks)")

args = argparser.parse_args()
if not args.inject_types:
	argparser.print_help()
	sys.exit()

doc = BeautifulSoup("".join(map(args.input_map, sys.stdin)))

for (tag, url_attr, attrs, target_tag) in args.inject_types:
	attrs[url_attr] = True

	for el in doc.find_all(tag, attrs=attrs):
		with open(el[url_attr], "r") as f:
			el.string = f.read()
		el.attrs.clear()
		if target_tag: el.name = target_tag

print(doc.decode(formatter="html"))
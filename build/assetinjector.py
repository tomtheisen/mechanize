import sys, re, base64

def datalize(filename):
	ext = filename.rsplit(".", 1)[-1]
	mimes = {
		"jpg": "image/jpeg",
		"jpeg": "image/jpeg",
		"gif": "image/gif",
		"png": "image/jpeg",
		# "woff": "application/font-woff",
	}

	if ext not in mimes: return filename

	with open(filename, "rb") as f:
		encoded = base64.standard_b64encode(f.read())
		return "url(data:%s;base64,%s)" % (mimes[ext], encoded)
	
pattern = r"""url\(([^)]+|'[^']+'|"[^"]+")\)"""
for line in sys.stdin:
	print re.sub(pattern, lambda m: datalize(m.group(1).strip("'"'"')), line.strip())
import argparse

argparser = argparse.ArgumentParser(description="Increments a number stored in the build file and injects it in the specified source code file, replacing the specified text.")
argparser.add_argument("build_file", help="Path to the filename that contains the build number, which should be a single integer.")
argparser.add_argument("source_file", help="Path to the source filename that contains the sourcecode.")
argparser.add_argument("build_token", help="String in source file to be replaced with build number.")

args = argparser.parse_args()

with open(args.build_file, "r") as fbuild:
	build = int(fbuild.readline()) + 1

with open(args.build_file, "w") as fbuild:
	fbuild.write(str(build))

with open(args.source_file, "r") as fsource:
	source = [line.replace(args.build_token, str(build)) for line in fsource]

with open(args.source_file, "w") as fsource:
	for line in source: fsource.write(line)
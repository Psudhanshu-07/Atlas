"""Offline CSV report generator for completed tasks.

Run: python tools/report_gen.py data/tasks.json out/report.csv
"""

import csv
import json
import os
import sys


def load_tasks(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_csv(rows, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "title", "done"])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "data/tasks.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "out/report.csv"
    rows = load_tasks(src)
    write_csv(rows, out)
    print("wrote %d rows to %s" % (len(rows), out))


if __name__ == "__main__":
    main()

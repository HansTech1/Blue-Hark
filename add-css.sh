#!/bin/bash
# This script adds the stylesheet link to all EJS files in the views folder.
# It searches for the <head> tag and inserts the CSS link immediately after it,
# if it isn't already present.

VIEWS_DIR="views"
CSS_LINK='<link rel="stylesheet" href="/style.css">'

# Loop through each .ejs file in the views directory.
for file in "$VIEWS_DIR"/*.ejs; do
  if grep -q "$CSS_LINK" "$file"; then
    echo "Stylesheet link already exists in $file."
  else
    # Insert the CSS link right after the <head> tag.
    sed -i '/<head>/a '"$CSS_LINK" "$file"
    echo "Added stylesheet link to $file."
  fi
done

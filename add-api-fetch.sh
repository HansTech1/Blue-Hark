#!/bin/bash
# This script adds the API fetch script reference to all EJS files in the views folder.
# It looks for the closing </body> tag and inserts the script line right before it,
# if the line is not already present.

VIEWS_DIR="views"
API_FETCH_SCRIPT='<script src="/js/api-fetch.js"></script>'

for file in "$VIEWS_DIR"/*.ejs; do
  if grep -q "$API_FETCH_SCRIPT" "$file"; then
    echo "API fetch script already exists in $file."
  else
    # Insert the API fetch script right before the closing </body> tag.
    sed -i '/<\/body>/i '"$API_FETCH_SCRIPT" "$file"
    echo "Added API fetch script to $file."
  fi
done
 

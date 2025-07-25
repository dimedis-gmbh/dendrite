#!/bin/bash

# Script to download Font Awesome icons and convert them to data URIs
# This creates a CSS file with all the icons embedded as data URIs

ICONS_DIR="temp-icons"
OUTPUT_FILE="fontawesome-icons.css"

# Create temporary directory
mkdir -p "$ICONS_DIR"

# Font Awesome GitHub base URL for SVG files
FA_BASE_URL="https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs"

# Define icon mappings: icon_class:fa_type/fa_name:color
declare -A ICON_MAPPINGS=(
    ["icon-folder"]="solid/folder:#FFD700"
    ["icon-file"]="regular/file:#666666"
    ["icon-text"]="regular/file-lines:#6c757d"
    ["icon-document"]="solid/file-word:#4285F4"
    ["icon-spreadsheet"]="solid/file-excel:#34A853"
    ["icon-presentation"]="solid/file-powerpoint:#EA4335"
    ["icon-pdf"]="solid/file-pdf:#E91E63"
    ["icon-code"]="solid/file-code:#9C27B0"
    ["icon-web"]="solid/globe:#FF5722"
    ["icon-data"]="solid/database:#607D8B"
    ["icon-image"]="solid/file-image:#FF9800"
    ["icon-audio"]="solid/file-audio:#E91E63"
    ["icon-video"]="solid/file-video:#3F51B5"
    ["icon-archive"]="solid/file-zipper:#795548"
    ["icon-executable"]="solid/gear:#616161"
)

echo "/* Font Awesome icons for Dendrite file manager */" > "$OUTPUT_FILE"
echo "/* Generated from Font Awesome Free 6.x */" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Download and process each icon
for class in "${!ICON_MAPPINGS[@]}"; do
    IFS=':' read -r icon_path color <<< "${ICON_MAPPINGS[$class]}"
    icon_name=$(basename "$icon_path" .svg)
    
    echo "Processing $class ($icon_path)..."
    
    # Download the SVG
    curl -s "$FA_BASE_URL/$icon_path.svg" -o "$ICONS_DIR/$icon_name.svg"
    
    if [ -f "$ICONS_DIR/$icon_name.svg" ]; then
        # Read the SVG content
        svg_content=$(cat "$ICONS_DIR/$icon_name.svg")
        
        # Modify the SVG: set viewBox to ensure 16x16 display, add fill color
        # Font Awesome SVGs typically have viewBox="0 0 512 512" or similar
        svg_content=$(echo "$svg_content" | sed -E "s/viewBox=\"[^\"]*\"/viewBox=\"0 0 512 512\" width=\"16\" height=\"16\"/")
        svg_content=$(echo "$svg_content" | sed -E "s/<svg/<svg fill=\"$color\"/")
        
        # URL encode the SVG for data URI
        # Replace problematic characters
        svg_encoded=$(echo "$svg_content" | sed 's/#/%23/g' | sed 's/"/'"'"'/g' | tr -d '\n')
        
        # Write CSS rule
        echo ".$class {" >> "$OUTPUT_FILE"
        echo "    background-image: url('data:image/svg+xml,$svg_encoded');" >> "$OUTPUT_FILE"
        echo "}" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    else
        echo "Failed to download $icon_path"
    fi
done

# Clean up
rm -rf "$ICONS_DIR"

echo "Font Awesome icons CSS generated in $OUTPUT_FILE"
echo ""
echo "To use these icons:"
echo "1. Copy the CSS rules to your styles.css file"
echo "2. Replace the existing icon definitions"
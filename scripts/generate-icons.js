#!/usr/bin/env node

/**
 * Generate Font Awesome icons as data URIs for Dendrite file manager
 * This script reads Font Awesome SVG files and creates CSS with embedded icons
 */

const fs = require('fs');
const path = require('path');

// Icon mappings: CSS class -> [Font Awesome icon file, color]
const iconMappings = {
    'icon-folder': ['folder.svg', '#FFD700'],
    'icon-file': ['file-regular.svg', '#666666'],
    'icon-text': ['file-lines-regular.svg', '#6c757d'],
    'icon-document': ['file-word.svg', '#4285F4'],
    'icon-spreadsheet': ['file-excel.svg', '#34A853'],
    'icon-presentation': ['file-powerpoint.svg', '#EA4335'],
    'icon-pdf': ['file-pdf.svg', '#E91E63'],
    'icon-code': ['file-code.svg', '#9C27B0'],
    'icon-web': ['globe.svg', '#FF5722'],
    'icon-data': ['database.svg', '#607D8B'],
    'icon-image': ['file-image.svg', '#FF9800'],
    'icon-audio': ['file-audio.svg', '#E91E63'],
    'icon-video': ['file-video.svg', '#3F51B5'],
    'icon-archive': ['file-zipper.svg', '#795548'],
    'icon-executable': ['gear.svg', '#616161']
};

// Paths
const fontAwesomePath = path.join(__dirname, '..', 'node_modules', '@fortawesome', 'fontawesome-free', 'svgs');
const outputPath = path.join(__dirname, '..', 'internal', 'assets', 'web', 'css', 'file-icons.css');

// Function to convert SVG to data URI
function svgToDataUri(svgContent, color) {
    // Apply color and optimize SVG
    let optimizedSvg = svgContent
        .replace(/<svg/, `<svg fill="${color}"`)
        .replace(/<!--.*?-->/g, '') // Remove comments
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/>\s+</g, '><') // Remove whitespace between tags
        .trim();
    
    // URL encode for data URI
    const encoded = optimizedSvg
        .replace(/"/g, "'")
        .replace(/%/g, '%25')
        .replace(/#/g, '%23')
        .replace(/{/g, '%7B')
        .replace(/}/g, '%7D')
        .replace(/</g, '%3C')
        .replace(/>/g, '%3E');
    
    return `data:image/svg+xml,${encoded}`;
}

// Generate CSS
function generateCss() {
    let css = `/* Font Awesome icons for Dendrite file manager */
/* Generated from Font Awesome Free 6.x */
/* DO NOT EDIT - This file is auto-generated */

`;

    for (const [className, [iconFile, color]] of Object.entries(iconMappings)) {
        // Determine if it's a regular or solid icon
        const isRegular = iconFile.includes('-regular');
        const iconName = iconFile.replace('-regular.svg', '.svg');
        const iconDir = isRegular ? 'regular' : 'solid';
        const svgPath = path.join(fontAwesomePath, iconDir, iconName);
        
        try {
            // Read SVG file
            let svgContent = fs.readFileSync(svgPath, 'utf8');
            
            // Ensure proper sizing for 16x16 display
            svgContent = svgContent.replace(
                /<svg([^>]*)>/,
                '<svg$1 width="16" height="16">'
            );
            
            // Convert to data URI
            const dataUri = svgToDataUri(svgContent, color);
            
            // Add CSS rule
            css += `.${className} {
    background-image: url('${dataUri}');
}

`;
            
            console.log(`✓ Generated ${className}`);
        } catch (err) {
            console.error(`✗ Failed to process ${className}: ${err.message}`);
            // Use fallback for missing icons
            css += `.${className} {
    background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="16" height="16"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>');
}

`;
        }
    }
    
    return css;
}

// Main execution
console.log('Generating Font Awesome icons for Dendrite...\n');

// Check if Font Awesome is installed
if (!fs.existsSync(fontAwesomePath)) {
    console.error('Font Awesome not found. Please run: npm install');
    process.exit(1);
}

// Generate CSS
const cssContent = generateCss();

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Write CSS file
fs.writeFileSync(outputPath, cssContent);

console.log(`\n✓ Icon CSS generated successfully!`);
console.log(`  Output: ${outputPath}`);
console.log(`\nNext steps:`);
console.log(`1. Copy the icon rules from file-icons.css to styles.css`);
console.log(`2. Replace the existing icon definitions`);
console.log(`3. Run: npm install (if you haven't already)`);
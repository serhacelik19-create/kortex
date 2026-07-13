#!/bin/bash
ICON_SOURCE="logo.jpg"
ICON_DEST="ios/Runner/Assets.xcassets/AppIcon.appiconset"

mkdir -p "$ICON_DEST"

# Generate icons with forced PNG format
sips -s format png -z 40 40 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-20x20@2x.png"
sips -s format png -z 60 60 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-20x20@3x.png"
sips -s format png -z 29 29 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-29x29@1x.png"
sips -s format png -z 58 58 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-29x29@2x.png"
sips -s format png -z 87 87 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-29x29@3x.png"
sips -s format png -z 80 80 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-40x40@2x.png"
sips -s format png -z 120 120 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-40x40@3x.png"
sips -s format png -z 120 120 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-60x60@2x.png"
sips -s format png -z 180 180 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-60x60@3x.png"
sips -s format png -z 20 20 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-20x20@1x.png"
sips -s format png -z 40 40 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-40x40@1x.png"
sips -s format png -z 76 76 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-76x76@1x.png"
sips -s format png -z 152 152 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-76x76@2x.png"
sips -s format png -z 167 167 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-83.5x83.5@2x.png"
sips -s format png -z 1024 1024 "$ICON_SOURCE" --out "$ICON_DEST/Icon-App-1024x1024@1x.png"

echo "iOS Icons generated successfully in PNG format!"

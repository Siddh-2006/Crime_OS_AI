import cv2
import numpy as np
import os

img_path = r'D:\CRIME_OS_AI\frontend\public\image.png'
out_path = r'D:\CRIME_OS_AI\frontend\public\shield_path.txt'

# Read image with alpha channel
img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)

if img is None:
    print('Failed to load image')
    exit(1)

# Extract alpha channel if present, otherwise grayscale and threshold
if img.shape[2] == 4:
    alpha = img[:, :, 3]
    _, thresh = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
else:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)

# Find external contours
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

if not contours:
    print('No contours found')
    exit(1)

# Find the largest contour
largest_contour = max(contours, key=cv2.contourArea)

# Simplify the contour heavily to get a clean shield path
# epsilon = 0.01 to 0.02 is usually good for a shield
epsilon = 0.015 * cv2.arcLength(largest_contour, True)
approx = cv2.approxPolyDP(largest_contour, epsilon, True)

# Convert to SVG Path
height, width = thresh.shape
path = "M "
for i, point in enumerate(approx):
    x, y = point[0]
    # Normalize coordinates to 0-100 scale for easier use in SVG viewBox="0 0 100 100"
    nx = round((x / width) * 100, 1)
    ny = round((y / height) * 100, 1)
    
    if i == 0:
        path += f"{nx} {ny} "
    else:
        path += f"L {nx} {ny} "
path += "Z"

with open(out_path, 'w') as f:
    f.write(path)

print('Success')

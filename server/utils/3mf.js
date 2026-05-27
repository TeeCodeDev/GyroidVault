const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Extracts the thumbnail from a 3MF file (which is a ZIP archive).
 * Typically found at Metadata/thumbnail.png.
 * 
 * @param {string} filePath - Absolute path to the .3mf file
 * @param {string} uploadsDir - Absolute path to the uploads directory where the thumbnail should be saved
 * @returns {string|null} - The relative URL path to the thumbnail (e.g. thumb_xyz.png) or null if not found
 */
function extract3mfThumbnail(filePath, uploadsDir) {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();
    
    // Look for thumbnail file. Bambu Studio uses Metadata/plate_1.png, PrusaSlicer/Orca uses Metadata/thumbnail.png.
    let thumbnailEntry = null;
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        const lowerName = entry.entryName.toLowerCase();
        if (lowerName === 'metadata/thumbnail.png' || lowerName === 'thumbnail.png' || lowerName.match(/^metadata\/plate_[0-9]+\.png$/)) {
          thumbnailEntry = entry;
          break; // Stop at first valid match
        }
      }
    }

    if (!thumbnailEntry) {
      return null; // No thumbnail found in 3MF
    }

    const imgData = thumbnailEntry.getData(); // Buffer of the image

    if (!imgData || imgData.length === 0) return null;

    // Generate a unique filename for the thumbnail
    const thumbFilename = `thumb_3mf_${crypto.randomBytes(8).toString('hex')}.png`;
    const thumbPath = path.join(uploadsDir, thumbFilename);

    // Save the image buffer to the file
    fs.writeFileSync(thumbPath, imgData);

    return thumbFilename;
  } catch (error) {
    console.error(`Failed to extract 3MF thumbnail for ${filePath}:`, error.message);
    return null;
  }
}

module.exports = {
  extract3mfThumbnail
};

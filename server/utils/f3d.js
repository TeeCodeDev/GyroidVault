const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

/**
 * Extracts the thumbnail from a Fusion 360 file (which is a ZIP archive).
 * Fusion stores a rendered preview per asset at <AssetName>/Previews/small.png.
 *
 * @param {string} filePath - Absolute path to the .f3d file
 * @param {string} uploadsDir - Absolute path to the uploads directory where the thumbnail should be saved
 * @returns {string|null} - The relative URL path to the thumbnail (e.g. thumb_xyz.png) or null if not found
 */
function extractF3dThumbnail(filePath, uploadsDir) {
  try {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    // A design can carry more than one asset (e.g. a simulation model alongside the
    // design itself), each with its own preview. Keep the largest, which is the design.
    let thumbnailEntry = null;
    for (const entry of zipEntries) {
      if (!entry.isDirectory && /(^|\/)previews\/[^/]+\.png$/i.test(entry.entryName)) {
        if (!thumbnailEntry || entry.header.size > thumbnailEntry.header.size) {
          thumbnailEntry = entry;
        }
      }
    }

    if (!thumbnailEntry) {
      return null; // No preview image embedded in the F3D
    }

    const { getZipEntryBuffer } = require('./modelHelpers');
      const imgData = getZipEntryBuffer(thumbnailEntry); // Buffer of the image

    if (!imgData || imgData.length === 0) return null;

    // Generate a unique filename for the thumbnail
    const thumbFilename = `thumb_f3d_${crypto.randomBytes(8).toString('hex')}.png`;
    const thumbPath = path.join(uploadsDir, thumbFilename);

    // Save the image buffer to the file
    fs.writeFileSync(thumbPath, imgData);

    return thumbFilename;
  } catch (error) {
    console.error(`Failed to extract F3D thumbnail for ${filePath}:`, error.message);
    return null;
  }
}

module.exports = {
  extractF3dThumbnail
};

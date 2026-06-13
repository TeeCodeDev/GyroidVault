# GyroidVault

**GyroidVault** is a self-hosted 3D model library and print manager. It helps you organize your STL, 3MF, and Gcode files, keep track of your print history, and group files into project collections.

![GyroidVault Dashboard](screenshots/GyroidVault-Dashboard_page.png)

> **⚠️ Early Release Notice:** GyroidVault is a brand-new project and still under active development. You may encounter bugs or rough edges. If you do, please [open an issue](https://github.com/TeeCodeDev/GyroidVault/issues) — your feedback helps make GyroidVault better for everyone!

## Screenshots

<table style="border: none; border-collapse: collapse;">
  <tr>
    <td style="padding: 5px; border: none;"><img src="screenshots/GyroidVault-Models_page.png" alt="Models Gallery"></td>
    <td style="padding: 5px; border: none;"><img src="screenshots/GyroidVault-Collection_page.png" alt="Collections Management"></td>
  </tr>
  <tr>
    <td style="padding: 5px; border: none;"><img src="screenshots/GyroidVault-Single_model_page.png" alt="Model Detail View"></td>
    <td style="padding: 5px; border: none;"><img src="screenshots/GyroidVault-Dashboard_page.png" alt="Dashboard Statistics"></td>
  </tr>
</table>

## Features

- **Dark/Light Mode**: Toggle between dark and light themes depending on your preference.
- **Batch Actions**: Use `Ctrl+Click` (or `Shift+Click`) to select multiple models in the grid to bulk tag, delete, or add to collections at once.
- **Folder Watching**: Automatically scan your local directories to import models, or upload them manually.
- **Folder View Collages**: Browse your local directories directly. Folders automatically generate dynamic 2x2 image collages based on the 3D files inside them.
- **Built-in 3D Viewer**: Preview STL and 3MF files directly in your browser.
- **Collections**: Group related files together for multi-part projects.
- **Model Versioning**: Track design iterations (v1, v2, final) under a single model entry.
- **Print Log**: Keep a history of your prints, filament types used, and success rates.
- **Public Share Links**: Generate secure, expiring links to share specific models with others.
- **1-Click Slicer Integration**: Set your "Preferred Slicer" in your profile to instantly send files to Bambu Studio, PrusaSlicer, OrcaSlicer, or Elegoo Slicer.
- **Multi-User & Roles (RBAC)**: Assign roles (Admin, Uploader, Viewer) to restrict access. Viewers get a clean, read-only interface with hidden action buttons.

## Quick Start (Docker Compose)

The easiest way to get GyroidVault running is using Docker Compose.

1. **Create a file** named `docker-compose.yml`:
    ```yaml
    services:
      gyroidvault:
        image: ghcr.io/teecodedev/gyroidvault:latest
        container_name: gyroidvault
        ports:
          - "3457:3000"
        volumes:
          - ./data:/app/data
          - /path/to/your/3dprints:/library
        environment:
          - NODE_ENV=production
          - PORT=3000
          - LIBRARY_PATH=/library
        restart: unless-stopped
    ```

2. **Configure your library**: Replace `/path/to/your/3dprints` with the path on your host machine where your models are stored.

3. **Start the container**:
    ```bash
    docker-compose up -d
    ```

4. **Open in browser**:
    Go to [http://localhost:3457](http://localhost:3457) in your browser.

## Initial Setup

### 1. Registering the Admin
The very first person to register on a new GyroidVault instance automatically becomes the Administrator.
- You do not need an invite code for the first registration.
- If you are prompted for an invite code on a fresh install, make sure your `./data` directory is empty.

### 2. Configuring SMTP (Email)
To enable password resets and user invitations, you need to configure SMTP:
1. Log in as the **Administrator**.
2. Go to **Settings** > **SMTP & Mail**.
3. Enter your SMTP server details (Host, Port, User, Password).
4. Save and test the configuration.

## Manual Installation

1. Install [Node.js](https://nodejs.org/) (v18+).
2. Clone this repo and run `npm install`.
3. Copy `.env.example` to `.env` and configure your settings.
4. Run `npm start`.

## Security & Privacy

- **Local SQLite Database**: Your data stays on your own hardware. No external cloud database or telemetry is forced.
- **Admin Control**: The first registered user automatically becomes the Admin. Invited users need token codes.
- **Advanced API Security**: Uses secure `HttpOnly` cookies for authentication, double-submit CSRF protection, and strict rate-limiting on login endpoints to prevent brute-force attacks.
- **File Management**: Uploaded files are kept locally in the database/uploads structure.

## Troubleshooting & Support

### Common Issues
- **Viewer not loading**: Make sure your browser supports WebGL and that you are not using an ad-blocker that blocks Three.js components.
- **File scanning issues**: Verify that your `LIBRARY_PATH` or the volume mapping in Docker is correct and that the app has read permissions for that directory.
- **Slicer links not opening**: Make sure the slicer (Bambu Studio, etc.) is installed and has registered its URL scheme on your OS.
- 💡 **Mac / Apple Silicon Users**: If GyroidVault doesn't respond on `http://localhost:3457/` after starting the container, try navigating to `http://127.0.0.1:3457/` instead. This is a common Docker networking quirk on Mac OSX!

### Support
- **Unraid Users**: Please use the dedicated support thread on the Unraid Forums.
- **General Issues**: Open an issue on [GitHub Issues](https://github.com/TeeCodeDev/GyroidVault/issues).

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for details. This ensures that the software remains free and that improvements made by the community are shared back.

---
*Built for the 3D Printing Community.*

*Note: Since English isn't my first language, I used AI to help write the documentation and structure the README. The application itself, the architecture, the UI, and the features are all my own, with AI helping me debug and iterate faster.*

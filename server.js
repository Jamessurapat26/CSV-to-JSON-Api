const express = require('express');
const multer = require('multer');
const fs = require('fs');
const csvParser = require('csv-parser');
const cors = require('cors');
const path = require('path');
const process = require('process');

const app = express();
app.use(cors());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cleanup any leftover files from previous crash
const cleanupUploads = () => {
    try {
        const files = fs.readdirSync(uploadsDir);
        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            fs.unlinkSync(filePath);
            console.log(`Cleaned up leftover file: ${file}`);
        });
    } catch (err) {
        console.error(`Cleanup error: ${err}`);
    }
};

// Run cleanup on startup
cleanupUploads();

// Optimize storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Use timestamp to prevent filename collisions
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// API Endpoint
app.post('/convert', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    let rowCount = 0;
    const MAX_ROWS = 100000; // Safety limit
    const startTime = new Date();

    fs.createReadStream(req.file.path)
        .pipe(csvParser({
            skipLines: 0,
            strict: true,
            maxRows: MAX_ROWS
        }))
        .on('data', (data) => {
            results.push(data);
            rowCount++;

            // Implement batch processing for very large files
            if (rowCount % 10000 === 0) {
                // Optional: Send progress updates for large files
                // This would require WebSockets for real-time updates
            }
        })
        .on('end', () => {
            // Clean up uploaded file
            fs.unlink(req.file.path, (err) => {
                if (err) console.error(`Error deleting file: ${err}`);
            });

            const processingTime = new Date() - startTime;
            res.json({
                data: results,
                rowCount: results.length,
                processingTime: `${processingTime}ms`
            });
        })
        .on('error', (error) => {
            console.error(`CSV parsing error: ${error}`);
            // Clean up in case of error too
            fs.unlink(req.file.path, (err) => {
                if (err) console.error(`Error deleting file: ${err}`);
            });
            res.status(500).json({ error: 'Failed to convert file' });
        });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(`Unhandled error: ${err.stack}`);
    res.status(500).json({
        error: 'Server encountered an unexpected error',
        message: process.env.NODE_ENV === 'production' ? 'Please try again later' : err.message
    });
});

// Handle uncaught exceptions to prevent crash
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanupUploads();
    // Give server time to send any pending responses before exiting
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // No need to exit here, just log it
});

// Handle graceful shutdown on termination signals
const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Cleaning up and shutting down...`);
    cleanupUploads();
    // Close server gracefully
    server.close(() => {
        console.log('Server shut down successfully');
        process.exit(0);
    });
    // Force close if it takes too long
    setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
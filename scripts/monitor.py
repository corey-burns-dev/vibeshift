import requests
import time
import logging
import os
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("sanctum_monitor.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("VibeMonitor")

# Configuration
SITE_URL = os.environ.get("SITE_URL", "http://localhost:8375/api")
CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "60")) # seconds

def check_health():
    try:
        response = requests.get(SITE_URL, timeout=10)
        if response.status_code == 200:
            data = response.json()
            checks = data.get("checks", {})
            db = checks.get("database", "unknown")
            redis = checks.get("redis", "unknown")
            
            if db == "healthy" and redis == "healthy":
                logger.info(f"VibeCheck: PASSED (DB: {db}, Redis: {redis})")
            else:
                logger.warning(f"VibeCheck: DEGRADED (DB: {db}, Redis: {redis})")
        else:
            logger.error(f"VibeCheck: FAILED (Status: {response.status_code})")
    except Exception as e:
        logger.error(f"VibeCheck: ERROR - {str(e)}")

if __name__ == "__main__":
    logger.info(f"Starting Sanctum Monitoring Agent for {SITE_URL}")
    while True:
        check_health()
        time.Sleep(CHECK_INTERVAL)

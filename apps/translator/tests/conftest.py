import os
import tempfile

os.environ["JOBFINDER_FAKE"] = "1"
os.environ["JOBFINDER_CACHE"] = os.path.join(tempfile.mkdtemp(), "cache.sqlite3")
os.environ["JOBFINDER_DOTENV"] = os.devnull

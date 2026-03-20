"""
database.py — Database configuration and connection management for FalkorDB.

FalkorDB is a Graph Database built on top of Redis. 
Instead of tables and rows, we use Nodes and Edges queried via Cypher.
"""

import os
from falkordb import FalkorDB

# FalkorDB Connection String
# IMPORTANT: Provide your FalkorDB Cloud credentials here.
# Example: "redis://default:password@my-instance.falkordb.com:12345"
FALKORDB_URL = os.getenv("FALKORDB_URL", "redis://localhost:6379")

# Connect to the FalkorDB server
db_client = FalkorDB.from_url(FALKORDB_URL)

def get_graph():
    """
    Dependency to yield the FalkorDB Graph object.
    Since FalkorDB connections are pooled natively, we just return the graph handle.
    """
    graph = db_client.select_graph("gympulse")
    yield graph

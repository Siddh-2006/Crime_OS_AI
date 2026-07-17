from qdrant_client import QdrantClient

client = QdrantClient("http://localhost:6333")

info = client.get_collection("final")

print(info)

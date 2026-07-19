from qdrant_client import QdrantClient
from qdrant_client.http.models import PayloadSchemaType

client = QdrantClient(
    host="localhost",
    port=6333,
)

client.update_collection(
    collection_name="light",
    optimizers_config={
        "indexing_threshold": 1
    },
)
"""
FastAPI dependency injection.

Provides:
  - get_embed_service()    → EmbedService with its dependencies
  - get_recommend_service() → RecommendationService with its dependencies
"""
from app.repositories.qdrant_repository import QdrantRepository
from app.services.embed_service import EmbedService
from app.services.recommendation_service import RecommendationService

# ── Singleton repository ────────────────────────────────────────────────────
_qdrant_repo = QdrantRepository()


def get_embed_service() -> EmbedService:
    """FastAPI dependency for the embed pipeline."""
    return EmbedService(repository=_qdrant_repo)


def get_recommend_service() -> RecommendationService:
    """FastAPI dependency for the recommendation pipeline."""
    return RecommendationService(repository=_qdrant_repo)

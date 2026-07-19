from app.services.orchestrator import ComplaintIntelligenceOrchestrator

# Singleton instance of orchestrator
_orchestrator = ComplaintIntelligenceOrchestrator()


def get_orchestrator() -> ComplaintIntelligenceOrchestrator:
    """FastAPI dependency for accessing the Complaint Intelligence pipeline orchestrator."""
    return _orchestrator

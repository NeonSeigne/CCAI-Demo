from fastapi import APIRouter
from .chat import router as chat_router
from .documents import router as document_router
from .sessions import router as session_router
from .provider import router as provider_router
from .debug import router as debug_router
from .root import router as root_router
from .phd_canvas import router as canvas_router
from .voice import router as voice_router
from .campus import router as campus_router
from .catalog import router as catalog_router
from .saved import router as saved_router
from .events import router as events_router
from .places import router as places_router
from .route import router as route_router
from .origin import router as origin_router
from .planner import router as planner_router

router = APIRouter()
router.include_router(chat_router)
router.include_router(document_router)
router.include_router(session_router)
router.include_router(provider_router)
router.include_router(debug_router)
router.include_router(root_router)
router.include_router(canvas_router)
router.include_router(voice_router)
router.include_router(catalog_router, prefix="/api")
router.include_router(campus_router, prefix="/api")
router.include_router(saved_router, prefix="/api")
router.include_router(events_router, prefix="/api")
router.include_router(places_router, prefix="/api")
router.include_router(route_router, prefix="/api")
router.include_router(origin_router, prefix="/api")
router.include_router(planner_router, prefix="/api")

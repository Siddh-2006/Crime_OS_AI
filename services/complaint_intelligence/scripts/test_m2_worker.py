import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.llm.worker import ComplaintProfileWorker
from app.llm.client import MockLLMClient
from app.schemas.complaint import ComplaintProfile

async def main():
    llm = MockLLMClient(default_response='')
    w = ComplaintProfileWorker(llm_client=llm)
    res = await w.run({'text':'Test complaint about unauthorized transfer'}, job_id='t1')
    print('succeeded:', res.succeeded)
    print('keys:', sorted(list((res.output or {}).keys())))
    try:
        cp = ComplaintProfile.model_validate(res.output or {})
        print('ComplaintProfile OK')
        print(cp.model_dump())
    except Exception as e:
        import traceback; traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())

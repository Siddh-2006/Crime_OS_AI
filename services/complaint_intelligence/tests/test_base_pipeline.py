"""
Unit tests for BasePipeline and BaseStep contracts.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import pytest

from app.base.pipeline import BasePipeline, BaseStep, StepError


@dataclass
class _Ctx:
    values: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class _AppendStep(BaseStep[_Ctx]):
    def __init__(self, value: str):
        self.step_name = f"append_{value}"
        self._value = value

    async def execute(self, ctx: _Ctx) -> _Ctx:
        ctx.values.append(self._value)
        return ctx


class _SkippableStep(BaseStep[_Ctx]):
    step_name = "skippable"

    async def execute(self, ctx: _Ctx) -> _Ctx:
        raise StepError("optional step failed", skip=True)


class _FatalStep(BaseStep[_Ctx]):
    step_name = "fatal"

    async def execute(self, ctx: _Ctx) -> _Ctx:
        raise StepError("fatal step failed", skip=False)


class _SimplePipeline(BasePipeline[_Ctx]):
    pipeline_name = "simple"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pipeline_runs_all_steps():
    p = _SimplePipeline()
    p.add_step(_AppendStep("a")).add_step(_AppendStep("b")).add_step(_AppendStep("c"))
    ctx = _Ctx()
    result = await p.run(ctx)
    assert result.context.values == ["a", "b", "c"]
    assert len(result.step_results) == 3
    assert all(not s.skipped for s in result.step_results)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_skippable_step_does_not_halt_pipeline():
    p = _SimplePipeline()
    p.add_step(_AppendStep("before")).add_step(_SkippableStep()).add_step(_AppendStep("after"))
    result = await p.run(_Ctx())
    assert result.context.values == ["before", "after"]
    skipped = result.skipped_steps
    assert len(skipped) == 1
    assert skipped[0].step_name == "skippable"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_fatal_step_halts_pipeline():
    p = _SimplePipeline()
    p.add_step(_AppendStep("before")).add_step(_FatalStep()).add_step(_AppendStep("after"))
    with pytest.raises(StepError):
        await p.run(_Ctx())


@pytest.mark.unit
@pytest.mark.asyncio
async def test_empty_pipeline_runs_cleanly():
    p = _SimplePipeline()
    ctx = _Ctx()
    result = await p.run(ctx)
    assert result.context.values == []
    assert result.step_results == []
    assert result.total_duration_ms >= 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_duration_is_tracked():
    p = _SimplePipeline()
    p.add_step(_AppendStep("x"))
    result = await p.run(_Ctx())
    assert result.total_duration_ms > 0
    assert result.step_results[0].duration_ms > 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_failed_steps_reported():
    p = _SimplePipeline()
    p.add_step(_SkippableStep())
    result = await p.run(_Ctx())
    assert len(result.failed_steps) == 1


@pytest.mark.unit
def test_add_step_fluent_chaining():
    p = _SimplePipeline()
    returned = p.add_step(_AppendStep("x"))
    assert returned is p
    assert len(p.steps) == 1

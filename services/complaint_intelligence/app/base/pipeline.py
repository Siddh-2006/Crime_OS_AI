"""
BasePipeline — abstract contract for multi-step processing chains.

A pipeline takes a typed Context object, passes it through an ordered
list of Steps, and returns the enriched Context.

Each Step is independently testable and communicates ONLY through the Context.
Steps must not call each other directly (Open/Closed Principle).

If a step raises StepError with skip=True, the pipeline continues.
Any other exception propagates and halts the pipeline.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Generic, List, TypeVar

from app.core.logging import logger

ContextT = TypeVar("ContextT")


class StepError(Exception):
    """Raised inside a Step to signal a non-fatal error (skippable)."""
    def __init__(self, message: str, *, skip: bool = False) -> None:
        super().__init__(message)
        self.skip = skip


@dataclass
class StepResult:
    step_name: str
    skipped: bool = False
    error: str | None = None
    duration_ms: float = 0.0


@dataclass
class PipelineResult(Generic[ContextT]):
    context: ContextT
    step_results: List[StepResult] = field(default_factory=list)
    total_duration_ms: float = 0.0

    @property
    def failed_steps(self) -> List[StepResult]:
        return [s for s in self.step_results if s.error]

    @property
    def skipped_steps(self) -> List[StepResult]:
        return [s for s in self.step_results if s.skipped]


class BaseStep(ABC, Generic[ContextT]):
    """
    A single unit of work inside a pipeline.
    Reads from and writes to the shared Context only.
    """
    step_name: str = "base_step"

    @abstractmethod
    async def execute(self, context: ContextT) -> ContextT:
        """Execute this step. Raise StepError(skip=True) to soft-fail."""
        ...


class BasePipeline(ABC, Generic[ContextT]):
    """
    Ordered sequence of steps that transform a Context.

    Usage:
        pipeline = MyPipeline()
        result = await pipeline.run(context)
    """

    pipeline_name: str = "base_pipeline"

    def __init__(self) -> None:
        self._steps: List[BaseStep[ContextT]] = []

    def add_step(self, step: BaseStep[ContextT]) -> "BasePipeline[ContextT]":
        """Register a step. Returns self for fluent chaining."""
        self._steps.append(step)
        return self

    @property
    def steps(self) -> List[BaseStep[ContextT]]:
        return list(self._steps)

    async def run(self, context: ContextT) -> PipelineResult[ContextT]:
        t_pipeline = time.perf_counter()
        step_results: List[StepResult] = []

        logger.info(
            f"[{self.pipeline_name}] Pipeline started",
            extra={"pipeline": self.pipeline_name, "step_count": len(self._steps)},
        )

        for step in self._steps:
            t_step = time.perf_counter()
            try:
                context = await step.execute(context)
                duration_ms = (time.perf_counter() - t_step) * 1000
                step_results.append(StepResult(step_name=step.step_name, duration_ms=duration_ms))
                logger.debug(
                    f"[{self.pipeline_name}] Step completed: {step.step_name}",
                    extra={"step": step.step_name, "duration_ms": round(duration_ms, 2)},
                )

            except StepError as exc:
                duration_ms = (time.perf_counter() - t_step) * 1000
                if exc.skip:
                    logger.warning(
                        f"[{self.pipeline_name}] Step skipped: {step.step_name} — {exc}",
                        extra={"step": step.step_name, "reason": str(exc)},
                    )
                    step_results.append(StepResult(
                        step_name=step.step_name,
                        skipped=True,
                        error=str(exc),
                        duration_ms=duration_ms,
                    ))
                else:
                    logger.error(
                        f"[{self.pipeline_name}] Step failed (fatal): {step.step_name}",
                        extra={"step": step.step_name, "error": str(exc)},
                    )
                    raise

        total_ms = (time.perf_counter() - t_pipeline) * 1000
        logger.info(
            f"[{self.pipeline_name}] Pipeline completed",
            extra={
                "pipeline": self.pipeline_name,
                "total_duration_ms": round(total_ms, 2),
                "steps_run": len(step_results),
                "steps_skipped": len([s for s in step_results if s.skipped]),
            },
        )

        return PipelineResult(
            context=context,
            step_results=step_results,
            total_duration_ms=total_ms,
        )

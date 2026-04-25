"""LLM response parser for stock analysis."""
import json
import logging
from typing import Dict, Any, Optional
from collections import Counter

logger = logging.getLogger(__name__)

class ReportGenerator:
    """Parses LLM responses into structured analysis reports."""

    def parse(self, llm_response: str) -> Dict[str, Any]:
        """
        Parse LLM JSON response into a dictionary.

        Args:
            llm_response: Raw string response from LLM

        Returns:
            Parsed dictionary with analysis results

        Raises:
            ValueError: If JSON parsing fails
        """
        try:
            # Clean up markdown code blocks if present
            text = llm_response.strip()
            if text.startswith("```"):
                # Handle ```json or ```python style blocks
                first_newline = text.find("\n")
                if first_newline > 0:
                    text = text[first_newline + 1:]
                if text.endswith("```"):
                    text = text[:-3]
            text = text.strip()

            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            # Try to extract JSON from the middle of the text
            start = llm_response.find("{")
            end = llm_response.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(llm_response[start:end])
                except json.JSONDecodeError:
                    pass
            raise ValueError(f"Invalid LLM response format: {llm_response[:200]}")

    def validate(self, parsed: Dict) -> bool:
        """
        Validate that all required fields are present.

        Args:
            parsed: Parsed dictionary from parse()

        Returns:
            True if valid, False otherwise
        """
        required_fields = [
            "recommendation",
            "confidence",
            "composite_score",
            "technical_score",
            "fundamental_score",
            "sentiment_score"
        ]

        for field in required_fields:
            if field not in parsed:
                logger.warning(f"Missing required field: {field}")
                return False

        # Validate recommendation value
        if parsed.get("recommendation") not in ["HOLD", "BUY", "SELL"]:
            logger.warning(f"Invalid recommendation: {parsed.get('recommendation')}")
            return False

        return True

    def extract_cycle_consistency(self, cycle_predictions: Dict) -> int:
        """
        Calculate cycle prediction consistency (0-100).

        Args:
            cycle_predictions: Dict with 24h, 3d, 1w, 1m predictions

        Returns:
            Consistency score as percentage
        """
        if not cycle_predictions:
            return 0

        directions = [p.get("direction") for p in cycle_predictions.values() if p.get("direction")]

        if not directions:
            return 0

        # Count most common direction
        counts = Counter(directions)
        most_common_count = counts.most_common(1)[0][1]

        return round(most_common_count / len(directions) * 100)

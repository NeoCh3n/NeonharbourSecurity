"""DynamoDB utilities for handling data type conversions."""
from decimal import Decimal
from typing import Any, Dict, List, Union


def to_decimal(value: Union[int, float, str, Decimal]) -> Decimal:
    """Convert numeric values to Decimal for DynamoDB compatibility.
    
    Args:
        value: Numeric value to convert
        
    Returns:
        Decimal representation of the value
    """
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def prepare_item_for_dynamodb(item: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively convert float values to Decimal in a dictionary.
    
    Args:
        item: Dictionary that may contain float values
        
    Returns:
        Dictionary with float values converted to Decimal
    """
    if isinstance(item, dict):
        return {k: prepare_item_for_dynamodb(v) for k, v in item.items()}
    elif isinstance(item, list):
        return [prepare_item_for_dynamodb(v) for v in item]
    elif isinstance(item, float):
        return to_decimal(item)
    else:
        return item


def prepare_confidence_metrics(confidence_metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare confidence metrics for DynamoDB storage.
    
    Args:
        confidence_metrics: Dictionary containing confidence scores
        
    Returns:
        Dictionary with float values converted to Decimal
    """
    prepared = {}
    
    # Convert main confidence scores
    for key in ["overall_confidence", "false_positive_probability", "automation_confidence"]:
        if key in confidence_metrics:
            prepared[key] = to_decimal(confidence_metrics[key])
    
    # Handle factors dictionary
    if "factors" in confidence_metrics:
        prepared["factors"] = {
            k: to_decimal(v) for k, v in confidence_metrics["factors"].items()
        }
    
    # Copy non-numeric fields as-is
    for key in ["reasoning"]:
        if key in confidence_metrics:
            prepared[key] = confidence_metrics[key]
            
    return prepared
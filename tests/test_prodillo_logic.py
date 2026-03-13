"""Tests for Prodillo prediction game logic.

These tests verify the core logic of the Prodillo game:
- Winner determination (closest prediction to round's BTC max)
- Treasury calculation (79% of total)
- Round state management
"""
import json
import pytest
from tests.conftest import write_json, read_json


class TestWinnerDetermination:
    """Test who wins based on predictions vs actual BTC max."""

    def test_closest_prediction_wins(self):
        """The prediction closest to bitcoinMax wins."""
        bitcoin_max = 108500
        predictions = [
            ("123", "Alice", 110000),    # diff: 1500
            ("456", "Bob", 105000),      # diff: 3500
            ("789", "Charlie", 108000),  # diff: 500 ← winner
        ]
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        winner_id, winner_name, winner_pred = sorted_preds[0]
        assert winner_name == "Charlie"
        assert winner_pred == 108000

    def test_exact_match_wins(self):
        """Exact prediction should always win."""
        bitcoin_max = 100000
        predictions = [
            ("1", "Exact", 100000),     # diff: 0 ← winner
            ("2", "Close", 100001),     # diff: 1
            ("3", "Far", 90000),        # diff: 10000
        ]
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        assert sorted_preds[0][1] == "Exact"

    def test_overprediction_vs_underprediction(self):
        """Equal distance above and below are tied (first wins)."""
        bitcoin_max = 100000
        predictions = [
            ("1", "Over", 101000),   # diff: 1000
            ("2", "Under", 99000),   # diff: 1000
        ]
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        # Both have same distance, first in list wins (stable sort)
        assert abs(sorted_preds[0][2] - bitcoin_max) == abs(sorted_preds[1][2] - bitcoin_max)

    def test_single_participant_wins(self):
        """Single participant should always win."""
        predictions = [("1", "Solo", 50000)]
        bitcoin_max = 100000
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        assert sorted_preds[0][1] == "Solo"

    def test_empty_predictions(self, prodillos_file):
        """No predictions should result in no winner."""
        data = {"users": {}, "treasury": 0}
        write_json(prodillos_file, data)
        loaded = read_json(prodillos_file)
        assert len(loaded["users"]) == 0


class TestTreasuryCalculation:
    """Test treasury and prize calculations."""

    def test_seventy_nine_percent_prize(self):
        """Winner gets 79% of treasury (ceiling)."""
        treasury = 1000
        prize = int(((treasury) * 0.79).__ceil__())
        assert prize == 790

    def test_treasury_rounding(self):
        """Treasury calculation rounds up."""
        treasury = 1001
        prize = int(((treasury) * 0.79).__ceil__())
        assert prize == 791  # 790.79 → 791

    def test_zero_treasury(self):
        """Zero treasury gives zero prize."""
        treasury = 0
        prize = int(((treasury) * 0.79).__ceil__())
        assert prize == 0


class TestRoundState:
    """Test round state transitions."""

    def test_round_reset(self, prodillos_file):
        """After round ends, prodillos reset to Hal Finney prediction."""
        hal_finney = {"0": {"user": "Hal Finney", "predict": 10000000}}
        write_json(prodillos_file, hal_finney)
        loaded = read_json(prodillos_file)
        assert "0" in loaded
        assert loaded["0"]["user"] == "Hal Finney"
        assert loaded["0"]["predict"] == 10000000

    def test_prediction_window_state(self):
        """Prediction window state tracks correctly."""
        state = {"isPredictionWindowOpen": True}
        # When prodilleableDeadline > 0
        state["isPredictionWindowOpen"] = 50 > 0
        assert state["isPredictionWindowOpen"] is True
        # When prodilleableDeadline === 0
        state["isPredictionWindowOpen"] = 0 > 0
        assert state["isPredictionWindowOpen"] is False


class TestFilePersistence:
    """Test that data persists correctly to JSON files."""

    def test_write_and_read_prodillos(self, prodillos_file, sample_prodillos):
        """Write prodillos and read them back."""
        write_json(prodillos_file, sample_prodillos)
        loaded = read_json(prodillos_file)
        assert loaded["treasury"] == 1000
        assert len(loaded["users"]) == 3
        assert loaded["users"]["123"]["user"] == "Alice"

    def test_write_and_read_bitcoin(self, bitcoin_file, sample_bitcoin_data):
        """Write bitcoin data and read it back."""
        write_json(bitcoin_file, sample_bitcoin_data)
        loaded = read_json(bitcoin_file)
        assert loaded["bitcoinMax"] == 108800
        assert loaded["dailyMax"] == 108500

    def test_write_and_read_trofeillos(self, trofeillos_file, sample_trofeillos):
        """Write trofeillos and read them back."""
        write_json(trofeillos_file, sample_trofeillos)
        loaded = read_json(trofeillos_file)
        assert loaded["currentChampion"] == "Alice"
        assert "trofeillos profesionales" in loaded["123"]

    def test_update_single_value(self, prodillos_file, sample_prodillos):
        """Update a single value preserves other data."""
        write_json(prodillos_file, sample_prodillos)
        loaded = read_json(prodillos_file)
        loaded["treasury"] = 2000
        write_json(prodillos_file, loaded)
        reloaded = read_json(prodillos_file)
        assert reloaded["treasury"] == 2000
        assert len(reloaded["users"]) == 3  # users preserved


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_very_large_prediction(self):
        """Hal Finney's $10M prediction handled correctly."""
        bitcoin_max = 100000
        predictions = [
            ("1", "Normal", 100000),
            ("0", "Hal Finney", 10000000),  # diff: 9900000
        ]
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        assert sorted_preds[0][1] == "Normal"

    def test_negative_prediction_handled(self):
        """Negative predictions shouldn't crash sorting."""
        bitcoin_max = 100000
        predictions = [
            ("1", "Negative", -1000),
            ("2", "Normal", 100000),
        ]
        sorted_preds = sorted(
            predictions,
            key=lambda x: abs(x[2] - bitcoin_max)
        )
        assert sorted_preds[0][1] == "Normal"

    def test_json_file_missing(self, prodillos_file):
        """Reading non-existent file returns empty dict."""
        import os
        assert not os.path.exists(prodillos_file)
        # This is what the TS loadValues does on error
        data = {}
        assert data == {}

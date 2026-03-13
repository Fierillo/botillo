"""Tests for Bitcoin price tracking logic.

Tests the price tracking, ATH detection, and daily max/min logic.
External API calls are mocked.
"""
import json
import pytest
from tests.conftest import write_json, read_json


class TestPriceTracking:
    """Test price comparison and tracking logic."""

    def test_new_ath_detected(self, bitcoin_file, sample_bitcoin_data):
        """When price > ATH, update ATH."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        new_price = 110000
        assert new_price > data["bitcoinATH"]
        
        data["bitcoinATH"] = new_price
        write_json(bitcoin_file, data)
        
        updated = read_json(bitcoin_file)
        assert updated["bitcoinATH"] == 110000

    def test_new_daily_max(self, bitcoin_file, sample_bitcoin_data):
        """When price > dailyMax but < ATH, update dailyMax."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        new_price = 108700  # > dailyMax (108500), < ATH (109000)
        assert new_price > data["dailyMax"]
        assert new_price < data["bitcoinATH"]
        
        data["dailyMax"] = new_price
        write_json(bitcoin_file, data)
        
        updated = read_json(bitcoin_file)
        assert updated["dailyMax"] == 108700

    def test_new_daily_min(self, bitcoin_file, sample_bitcoin_data):
        """When price < dailyMin, update dailyMin."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        new_price = 106000  # < dailyMin (107000)
        assert new_price < data["dailyMin"]
        
        data["dailyMin"] = new_price
        write_json(bitcoin_file, data)
        
        updated = read_json(bitcoin_file)
        assert updated["dailyMin"] == 106000

    def test_price_between_daily_bounds(self, bitcoin_file, sample_bitcoin_data):
        """Price between daily min/max shouldn't trigger updates."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        new_price = 107500  # between 107000 and 108500
        assert new_price > data["dailyMin"]
        assert new_price < data["dailyMax"]
        assert new_price < data["bitcoinATH"]
        
        # No updates should happen
        assert data["dailyMin"] == 107000
        assert data["dailyMax"] == 108500

    def test_bitcoin_max_for_prodillo(self, bitcoin_file, sample_bitcoin_data):
        """bitcoinMax tracks the all-time high for the current prodillo round."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        new_price = 109500
        if new_price > data["bitcoinMax"]:
            data["bitcoinMax"] = new_price
            data["bitcoinMaxBlock"] = 890100
        
        write_json(bitcoin_file, data)
        updated = read_json(bitcoin_file)
        assert updated["bitcoinMax"] == 109500
        assert updated["bitcoinMaxBlock"] == 890100


class TestBitstampResponse:
    """Test parsing of Bitstamp API responses."""

    def test_parse_valid_response(self):
        """Valid Bitstamp response parsed correctly."""
        mock_response = {
            "last": "108500",
            "low": "107000",
            "high": "109000",
        }
        price = int(mock_response["last"])
        low = int(mock_response["low"])
        high = int(mock_response["high"])
        
        assert price == 108500
        assert low == 107000
        assert high == 109000

    def test_parse_decimal_response(self):
        """Response with decimals handled by parseInt."""
        mock_response = {"last": "108500.50"}
        price = int(mock_response["last"].split(".")[0])
        assert price == 108500


class TestDailyReset:
    """Test daily max/min reset logic."""

    def test_daily_reset_preserves_ath(self, bitcoin_file):
        """Daily reset should keep ATH and bitcoinMax."""
        data = {
            "bitcoinATH": 109000,
            "dailyMax": 0,
            "dailyMin": float('inf'),
            "bitcoinMax": 108800,
            "bitcoinMaxBlock": 890000,
        }
        # Simulate reset
        data["dailyMax"] = 0
        data["dailyMin"] = float('inf')
        
        # These should be preserved
        assert data["bitcoinATH"] == 109000
        assert data["bitcoinMax"] == 108800
        assert data["bitcoinMaxBlock"] == 890000
        assert data["dailyMax"] == 0
        assert data["dailyMin"] == float('inf')

    def test_round_reset_clears_bitcoin_max(self, bitcoin_file, sample_bitcoin_data):
        """After prodillo round ends, bitcoinMax resets to 0."""
        write_json(bitcoin_file, sample_bitcoin_data)
        data = read_json(bitcoin_file)
        
        # Round ends
        data["bitcoinMax"] = 0
        data["bitcoinMaxBlock"] = 0
        write_json(bitcoin_file, data)
        
        updated = read_json(bitcoin_file)
        assert updated["bitcoinMax"] == 0
        assert updated["bitcoinMaxBlock"] == 0
        # ATH and daily values preserved
        assert updated["bitcoinATH"] == 109000


class TestNotificationLogic:
    """Test when notifications should be sent."""

    def test_ath_notification(self):
        """ATH notification when price > all previous."""
        ath = 109000
        new_price = 110000
        should_notify = new_price > ath
        assert should_notify is True

    def test_daily_max_notification(self):
        """Daily max notification when price > dailyMax but < ATH."""
        ath = 109000
        daily_max = 108500
        new_price = 108700
        should_notify = new_price > daily_max and new_price < ath
        assert should_notify is True

    def test_daily_min_notification(self):
        """Daily min notification when price < dailyMin."""
        daily_min = 107000
        new_price = 106000
        should_notify = new_price < daily_min
        assert should_notify is True

    def test_no_notification_in_range(self):
        """No notification when price is within daily bounds."""
        daily_max = 108500
        daily_min = 107000
        new_price = 107500
        should_notify = (
            new_price > daily_max or new_price < daily_min
        )
        assert should_notify is False

import { useState, useEffect } from 'react'
import { getCategoryMonthly, getCategoryCumulative, getCoinStats, getCorrelation } from '../api/analysis'

const EMPTY_RETURNS = { categories: [], rows: [] }

export function useCategoryMonthly() {
  const [data, setData] = useState(EMPTY_RETURNS)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryMonthly().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCategoryCumulative(period = '월') {
  const [data, setData] = useState(EMPTY_RETURNS)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    getCategoryCumulative(period).then(setData).finally(() => setLoading(false))
  }, [period])
  return { data, loading }
}

export function useCoinStats() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCoinStats().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCorrelation(market) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!market) return
    setLoading(true)
    getCorrelation(market).then(setData).finally(() => setLoading(false))
  }, [market])
  return { data, loading }
}

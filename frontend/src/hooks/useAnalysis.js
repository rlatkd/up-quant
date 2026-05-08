import { useState, useEffect } from 'react'
import { getCategoryMonthly, getCategoryCumulative, getCoinStats } from '../api/analysis'

export function useCategoryMonthly() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryMonthly().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCategoryCumulative() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryCumulative().then(setData).finally(() => setLoading(false))
  }, [])
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

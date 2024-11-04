import { Box, SpaceBetween, TextFilter, Header, Table, Button, Link } from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { fetchHistory, History, stageToString } from '../apis/history';

interface ShortsHistoryProps {
  // Define any props the component expects here
}

const ShortsHistory: React.FC<ShortsHistoryProps> = () => {

  const [ histories, setHistories ] = useState<History[]>([]);
  const [ loading, setLoading ] = useState<boolean>(true);

  useEffect(() => {
    fetchHistory()
    .then(histories => {
      histories.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)
      setHistories(histories)
      setLoading(false);
    })
  }, [])

  return (
    <Table
      columnDefinitions={[
        {
          id: "videoName",
          header: "Video Name",
          cell: item => <Link href={`${item.id}`} key={item.id}>{item.videoName}</Link>,
          isRowHeader: true
        },
        {
          id: "id",
          header: "id",
          cell: item => item.id,
        },
        {
          id: "shortified",
          header: "shortified",
          cell: item => stageToString[item.stage]
        },
        {
          id: "createdAt",
          header: "createdAt",
          cell: item => item.createdAt,
        }
      ]}
      columnDisplay={[
        { id: "videoName", visible: true },
        { id: "id", visible: false },
        { id: "createdAt", visible: true },
        { id: "shortified", visible: true },
      ]}
      enableKeyboardNavigation
      items={histories}
      loading={loading}
      loadingText="Loading resources"
      empty={
        <Box
          margin={{ vertical: "xs" }}
          textAlign="center"
          color="inherit"
        >
          <SpaceBetween size="m">
            <b>No resources</b>
            <Button>Create resource</Button>
          </SpaceBetween>
        </Box>
      }
      filter={
        <TextFilter
          filteringPlaceholder="Find history"
          filteringText=""
        />
      }
      header={
        <Header>
          Shorts History
        </Header>
      }
      // pagination={
      //   <Pagination currentPageIndex={1} pagesCount={2} />
      // }
    />
  );
};

export default ShortsHistory;

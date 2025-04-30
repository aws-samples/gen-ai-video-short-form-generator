import { Box, SpaceBetween, TextFilter, Header, Table, Button, Link, Modal } from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { fetchHistory, History, stageToString, deleteHistory } from '../apis/history';
import { modelOptions } from '../data/modelList';


interface ShortsHistoryProps {
  // Define any props the component expects here
}

const ShortsHistory: React.FC<ShortsHistoryProps> = () => {

  const [ histories, setHistories ] = useState<History[]>([]);
  const [ loading, setLoading ] = useState<boolean>(true);
  const [ visible, setVisible ] = useState(false);
  const [ itemToDelete, setItemToDelete ] = useState<History | null>(null);

  const getModelName = (modelId: string): string => {
    const model = modelOptions.find(model => model.modelId === modelId);
    return model ? model.name : modelId; // fallback to modelId if not found
  };
  
  const handleDelete = (item: History) => {
    setItemToDelete(item);
    setVisible(true);
  };
  
  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      try {
        await deleteHistory(itemToDelete.id);
        setHistories(histories.filter(h => h.id !== itemToDelete.id));
      } catch (error) {
        console.error('Failed to delete history:', error);
      }
    }
    setVisible(false);
    setItemToDelete(null);
  };
  
  const handleCancelDelete = () => {
    setVisible(false);
    setItemToDelete(null);
  };

  useEffect(() => {
    fetchHistory()
    .then(histories => {
      histories.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)
      setHistories(histories)
      setLoading(false);
    })
  }, [])

  return (
    <>
    <Table
      columnDefinitions={[
        {
          id: "videoName",
          header: "Video Name",
          cell: item => <Link href={`history/${item.id}`} key={item.id}>{item.videoName}</Link>,
          isRowHeader: true
        },
        {
          id: "modelId",
          header: "Model",
          cell: item => getModelName(item.modelID),
        },
        {
          id: "theme",
          header: "Theme",
          cell: item => item.theme || "general",
        },
        {
          id: "numberOfVideos",
          header: "Videos",
          cell: item => item.numberOfVideos || 1,
        },
        {
          id: "videoLength",
          header: "Length (sec)",
          cell: item => item.videoLength || 60,
        },
        {
          id: "shortified",
          header: "Status",
          cell: item => stageToString[item.stage]
        },
        {
          id: "id",
          header: "ID",
          cell: item => item.id,
        },
        {
          id: "createdAt",
          header: "Created At",
          cell: item => new Date(item.createdAt).toLocaleString(),
        },
        {
          id: "delete",
          header: "Delete",
          cell: item => (
            <Button 
              iconName="remove" 
              variant="icon" 
              onClick={() => handleDelete(item)}
            />
          )
        }
      ]}
      columnDisplay={[
        { id: "videoName", visible: true },
        { id: "modelId", visible: true },
        { id: "theme", visible: true },
        { id: "numberOfVideos", visible: true },
        { id: "videoLength", visible: true },
        { id: "shortified", visible: true },
        { id: "id", visible: false },
        { id: "createdAt", visible: true },
        { id: "delete", visible: true },
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
            <b>No History</b>
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
          Short-form History
        </Header>
      }
    />
    <Modal
      onDismiss={handleCancelDelete}
      visible={visible}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
      header="Confirm Delete"
    >
      {itemToDelete && (
        <Box>
          Are you sure you want to delete <br />
          <b>{itemToDelete.videoName}</b>? <br />
          This action cannot be undone.
        </Box>
      )}
    </Modal>
    </>
  );
};

export default ShortsHistory;

import { Box, SpaceBetween, TextFilter, Header, Cards, Button, Modal, Container, Spinner } from '@cloudscape-design/components';
import { Pagination } from '@aws-amplify/ui-react';
import React, { useEffect, useState } from 'react';
import { type Gallery, fetchGallery, deleteGallery, client } from '../apis/gallery';
import { getUrl } from 'aws-amplify/storage';
import { useNavigate } from 'react-router-dom';

interface ShortsGalleryProps {
  // Define any props the component expects here
}

const ShortsGallery: React.FC<ShortsGalleryProps> = () => {
  const [galleryItems, setGalleryItems] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, string>>({});
  const [videoNames, setVideoNames] = useState<Record<string, string>>({});
  const [selectedItems, setSelectedItems] = useState<Gallery[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  
  const [pageTokens, setPageTokens] = React.useState<(null|string|undefined)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = React.useState(1);
  const [hasMorePages, setHasMorePages] = React.useState(true);
  
  const navigate = useNavigate();

  const loadPage = async (pageToken: string | null | undefined, isInitialLoad: boolean = false) => {
    setLoading(true);
    try {
      const { galleries, nextToken } = await fetchGallery(pageToken);
      
      if (!nextToken) {
        setHasMorePages(false);
      } else {
        setHasMorePages(true);
      }

      if (isInitialLoad) {
        setPageTokens([null, nextToken]);
      }

      const names: Record<string, string> = {};
      for (const item of galleries) {
        try {
          const history = await item.history();
          if (history.data?.videoName) {
            names[item.id] = history.data.videoName;
          }
        } catch (err) {
          console.error(`Error loading video name for ${item.id}:`, err);
        }
      }

      setGalleryItems(galleries);
      setVideoNames(names);
    } catch (error) {
      console.error('Error loading gallery:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = async () => {
    if (hasMorePages && currentPageIndex === pageTokens.length) {
      const currentPageToken = pageTokens[pageTokens.length - 1];
      const { galleries, nextToken } = await fetchGallery(currentPageToken);
      
      if (!nextToken) {
        setHasMorePages(false);
      }
      
      setPageTokens([...pageTokens, nextToken]);
      setGalleryItems(galleries);
      
      const names: Record<string, string> = {};
      for (const item of galleries) {
        try {
          const history = await item.history();
          if (history.data?.videoName) {
            names[item.id] = history.data.videoName;
          }
        } catch (err) {
          console.error(`Error loading video name for ${item.id}:`, err);
        }
      }
      setVideoNames(names);
    }
    setCurrentPageIndex(currentPageIndex + 1);
  };

  const handlePreviousPage = async () => {
    const prevPageToken = pageTokens[currentPageIndex - 2];
    await loadPage(prevPageToken);
    setCurrentPageIndex(currentPageIndex - 1);
  };

  useEffect(() => {
    loadPage(null, true);

    const sub = client.models.Gallery.observeQuery().subscribe({
      next: () => {
        setPageTokens([null]);
        setCurrentPageIndex(1);
        setHasMorePages(true);
        loadPage(null, true);
      }
    })
    return () => sub.unsubscribe();
  }, []);

  // Fetch thumbnails for gallery items
  useEffect(() => {
    const loadThumbnails = async () => {
      const thumbnails: Record<string, string> = {};
      
      for (const item of galleryItems) {
        try {
          // Try to get a thumbnail or poster for the video
          const file = await getUrl({
            path: `videos/${item.historyId}/Final/${item.highlightId}.0000000.jpg`, // assuming thumbnails are stored in this format
            options: {
              validateObjectExistence: true,
              useAccelerateEndpoint: true,
            },
          });
          thumbnails[item.id] = file.url.toString();
        } catch (err) {
          // If thumbnail doesn't exist, we'll use a placeholder or leave it empty
          console.log(`No thumbnail for ${item.id}`);
        }
      }
      
      setVideoThumbnails(thumbnails);
    };
    
    if (galleryItems.length > 0) {
      loadThumbnails();
    }
  }, [galleryItems]);

  // Handle delete action
  const handleDelete = async () => {
    try {
      for (const item of selectedItems) {
        await deleteGallery(item.id);
      }
      
      // Update gallery items after deletion
      setGalleryItems(galleryItems.filter(item => !selectedItems.includes(item)));
      setSelectedItems([]);
      setDeleteModalVisible(false);
    } catch (error) {
      console.error('Error deleting gallery items:', error);
    }
  };

  // Handle video card click
  const handleCardClick = (item: Gallery) => {
    navigate(`/shorts/${item.historyId}/${item.highlightId}`);
  };

  // Filter gallery items based on filter text
  const filteredItems = galleryItems.filter(item => {
    if (!filterText) return true;
    return (
      item.question?.toLowerCase().includes(filterText.toLowerCase())
    );
  });


  return (
    <>
      <Container
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  disabled={selectedItems.length === 0}
                  onClick={() => setDeleteModalVisible(true)}
                >
                  Delete
                </Button>
              </SpaceBetween>
            }
          >
            Short-form Gallery
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Filter input */}
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder="Find videos"
            filteringAriaLabel="Filter videos"
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />

          {loading ? (
            <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
              <Spinner size="large" />
            </Box>
          ) : filteredItems.length === 0 ? (
            <Box
              margin={{ vertical: "xs" }}
              textAlign="center"
              color="inherit"
              padding={{ vertical: 'xxxl' }}
            >
              <SpaceBetween size="m">
                <b>No videos in gallery</b>
                <p>Upload and process videos to see them here</p>
              </SpaceBetween>
            </Box>
          ) : (
            <Cards
              cardDefinition={{
                header: item => item.question || "Untitled Short",
                sections: [
                  {
                    id: "thumbnail",
                    content: item => (
                      <Box padding="s">
                          <img
                            src={videoThumbnails[item.id]}
                            alt={item.question || "Video thumbnail"}
                            style={{
                              width: '100%',
                              objectFit: 'cover',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                            onClick={() => handleCardClick(item)}
                          />
                      </Box>
                    )
                  },
                  {
                    id: "video",
                    header: "Video",
                    content: item => videoNames[item.id] || "Loading..."
                  },
                  {
                    id: "created",
                    header: "Created",
                    content: item => new Date(item.createdAt!).toLocaleString()
                  }
                ]
              }}
              cardsPerRow={[
                { cards: 1, minWidth: 0 },
                { cards: 2, minWidth: 500 },
                { cards: 3, minWidth: 900 },
                { cards: 4, minWidth: 1200 }
              ]}
              items={galleryItems}
              selectedItems={selectedItems}
              selectionType="multi"
              onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
              empty={
                <Box textAlign="center" color="inherit">
                  <b>No videos</b>
                  <Box padding={{ bottom: "s" }}>
                    No videos to display
                  </Box>
                </Box>
              }
            />
          )}

          {/* Pagination */}
          {filteredItems.length > 0 && (
            <Box textAlign="center">
              <Pagination
                currentPage={currentPageIndex}
                totalPages={pageTokens.length}
                hasMorePages={hasMorePages}
                onNext={handleNextPage}
              onPrevious={handlePreviousPage}
              onChange={async (pageIndex) => {
                if (pageIndex) {
                  const targetPageToken = pageTokens[pageIndex - 1];
                  await loadPage(targetPageToken);
                  setCurrentPageIndex(pageIndex);
                }
              }}
              />
            </Box>
          )}
        </SpaceBetween>
      </Container>

      {/* Delete confirmation modal */}
      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header="Delete shorts"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteModalVisible(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDelete}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Box>
          Are you sure you want to delete {selectedItems.length} {selectedItems.length === 1 ? 'short' : 'shorts'}?
          This action cannot be undone.
        </Box>
      </Modal>
    </>
  );
};

export default ShortsGallery;